import { PageShell } from '@/components/page-shell'
import { createClient } from '@/lib/supabase/server'

export default async function Page(){
  const supabase=await createClient()
  const [{count:totalLeads},{count:assigned},{count:completed},{count:callbacks},{count:consented},{data:employees},{data:logs}]=await Promise.all([
    supabase.from('leads').select('*',{count:'exact',head:true}).is('deleted_at',null),
    supabase.from('leads').select('*',{count:'exact',head:true}).not('current_assignee_id','is',null),
    supabase.from('leads').select('*',{count:'exact',head:true}).eq('status','COMPLETED'),
    supabase.from('callbacks').select('*',{count:'exact',head:true}).eq('status','PENDING'),
    supabase.from('consent_pool').select('*',{count:'exact',head:true}),
    supabase.from('employees').select('id,name,status').order('name'),
    supabase.from('counseling_logs').select('employee_id,status').order('created_at',{ascending:false}).limit(5000)
  ])
  const byEmployee=new Map<string,{total:number;completed:number;callback:number;rejected:number}>()
  for(const l of logs||[]){const s=byEmployee.get(l.employee_id)||{total:0,completed:0,callback:0,rejected:0};s.total++;if(l.status==='COMPLETED')s.completed++;if(l.status==='CALLBACK')s.callback++;if(l.status==='REJECTED')s.rejected++;byEmployee.set(l.employee_id,s)}
  const kpis=[['전체 고객',totalLeads||0],['동의 Pool',consented||0],['배정 고객',assigned||0],['상담완료',completed||0],['재통화 예정',callbacks||0]]
  return <PageShell title="통계"><div className="grid" style={{gridTemplateColumns:'repeat(5,minmax(0,1fr))'}}>{kpis.map(([n,v])=><div className="card" key={String(n)}><div className="kpiLabel">{n}</div><div className="kpi">{v}</div></div>)}</div><div className="card section"><div className="sectionHead"><h2>직원별 상담 현황</h2><span className="muted">최근 상담 로그 기준</span></div><table className="dataTable"><thead><tr><th>직원</th><th>계정상태</th><th>상담기록</th><th>완료</th><th>재통화</th><th>거절</th></tr></thead><tbody>{(employees||[]).map(e=>{const s=byEmployee.get(e.id)||{total:0,completed:0,callback:0,rejected:0};return <tr key={e.id}><td><strong>{e.name}</strong></td><td><span className={`badge ${e.status==='ACTIVE'?'badgeGreen':''}`}>{e.status}</span></td><td>{s.total}</td><td>{s.completed}</td><td>{s.callback}</td><td>{s.rejected}</td></tr>})}{(!employees||employees.length===0)&&<tr><td colSpan={6} className="muted">등록된 직원이 없습니다.</td></tr>}</tbody></table></div></PageShell>
}
