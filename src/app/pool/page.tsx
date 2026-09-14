import { Sidebar } from '@/components/sidebar'
import { PoolAssigner } from '@/components/pool-assigner'
import { createClient } from '@/lib/supabase/server'

function maskPhone(v:string){
  const d=v.replace(/\D/g,'')
  if(d.length<8)return v
  return `${d.slice(0,3)}-${'*'.repeat(Math.max(4,d.length-7))}-${d.slice(-4)}`
}

export default async function Page(){
  const supabase=await createClient()
  const client=supabase as any
  const [{data:pool},{data:employees}]=await Promise.all([
    client.from('consent_pool').select('id,consented_at,priority_score,current_assignee_id,leads(customer_name,phone_e164,product_interest),employees(name)').order('priority_score',{ascending:false}).order('consented_at',{ascending:true}).limit(200),
    client.from('employees').select('id,name').eq('status','ACTIVE').order('name',{ascending:true})
  ])
  const unassigned=(pool??[]).filter((r:any)=>!r.current_assignee_id).length
  return <div className="shell"><Sidebar/><main className="main">
    <div className="topbar"><div><div className="eyebrow">Consent Pool</div><h1 className="title">중앙 동의 DB Pool</h1><div className="muted">동의 완료 고객은 중앙 Pool에 적재한 뒤 관리자가 직원에게 배정합니다.</div></div><PoolAssigner employees={employees??[]}/></div>
    <div className="grid">
      <div className="card"><div className="kpiLabel">Pool 전체</div><div className="kpi">{pool?.length??0}</div></div>
      <div className="card"><div className="kpiLabel">미배정</div><div className="kpi">{unassigned}</div></div>
      <div className="card"><div className="kpiLabel">배정 완료</div><div className="kpi">{(pool?.length??0)-unassigned}</div></div>
      <div className="card"><div className="kpiLabel">활성 직원</div><div className="kpi">{employees?.length??0}</div></div>
    </div>
    <div className="card section"><table className="dataTable"><thead><tr><th>전화번호</th><th>고객명</th><th>동의시간</th><th>관심상품</th><th>우선순위</th><th>담당자</th></tr></thead><tbody>{(pool??[]).map((r:any)=>{
      const lead=Array.isArray(r.leads)?r.leads[0]:r.leads
      const emp=Array.isArray(r.employees)?r.employees[0]:r.employees
      return <tr key={r.id}><td><strong>{lead?.phone_e164?maskPhone(lead.phone_e164):'-'}</strong></td><td>{lead?.customer_name||'-'}</td><td>{new Date(r.consented_at).toLocaleString('ko-KR')}</td><td>{lead?.product_interest||'-'}</td><td>{r.priority_score}</td><td><span className={`badge ${r.current_assignee_id?'badgeGreen':'badgeAmber'}`}>{emp?.name||'미배정'}</span></td></tr>
    })}{!pool?.length&&<tr><td colSpan={6} className="muted">동의 완료 고객이 아직 없습니다.</td></tr>}</tbody></table></div>
  </main></div>
}
