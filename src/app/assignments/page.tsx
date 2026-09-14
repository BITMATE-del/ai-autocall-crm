import { Sidebar } from '@/components/sidebar'
import { AssignmentManager } from '@/components/assignment-manager'
import { createClient } from '@/lib/supabase/server'

export default async function Page(){
  const supabase=await createClient()
  const [{data:employees},{data:rows},{count:unassigned},{count:inCounseling},{count:completed},{count:callbacks}]=await Promise.all([
    supabase.from('employees').select('id,name').eq('status','ACTIVE').order('name'),
    supabase.from('leads').select('id,customer_name,phone_e164,status,current_assignee_id').not('current_assignee_id','is',null).order('updated_at',{ascending:false}).limit(200),
    supabase.from('consent_pool').select('*',{count:'exact',head:true}).is('current_assignee_id',null),
    supabase.from('leads').select('*',{count:'exact',head:true}).eq('status','IN_COUNSELING'),
    supabase.from('leads').select('*',{count:'exact',head:true}).eq('status','COMPLETED'),
    supabase.from('callbacks').select('*',{count:'exact',head:true}).eq('status','PENDING')
  ])
  const kpis=[['미배정 Pool',String(unassigned||0)],['상담중',String(inCounseling||0)],['완료',String(completed||0)],['재통화 예정',String(callbacks||0)]]
  return <div className="shell"><Sidebar/><main className="main"><div className="topbar"><div><div className="eyebrow">Assignment</div><h1 className="title">DB 배정관리</h1><div className="muted">현재 배정 고객을 직원 간 재배정하거나 중앙 Pool로 회수합니다.</div></div></div><div className="grid">{kpis.map(([n,v])=><div className="card" key={n}><div className="kpiLabel">{n}</div><div className="kpi">{v}</div></div>)}</div><AssignmentManager rows={rows||[]} employees={employees||[]}/></main></div>
}
