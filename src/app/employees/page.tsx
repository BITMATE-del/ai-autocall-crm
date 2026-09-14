import { Sidebar } from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'
import { createEmployeeInvite, setEmployeeStatus } from './actions'

export const dynamic = 'force-dynamic'

export default async function Page(){
  const supabase = await createClient()
  const [{ data: employees }, { data: teams }, { data: assignments }, { data: logs }] = await Promise.all([
    supabase.from('employees').select('id,name,status,team_id,user_id,invited_email,invite_code,claimed_at,created_at').order('created_at',{ascending:false}),
    supabase.from('teams').select('id,name'),
    supabase.from('assignments').select('employee_id,revoked_at'),
    supabase.from('counseling_logs').select('employee_id,status'),
  ])
  const teamMap = new Map((teams || []).map(t => [t.id,t.name]))
  const assigned = new Map<string,number>()
  for(const row of assignments || []) if(!row.revoked_at) assigned.set(row.employee_id,(assigned.get(row.employee_id)||0)+1)
  const completed = new Map<string,number>()
  for(const row of logs || []) if(row.status==='COMPLETED') completed.set(row.employee_id,(completed.get(row.employee_id)||0)+1)

  return <div className="shell"><Sidebar/><main className="main">
    <div className="topbar"><div><div className="eyebrow">Organization</div><h1 className="title">직원 관리</h1><div className="muted">직원 초대코드를 발급하고, 가입한 직원 계정을 회사에 연결합니다.</div></div></div>

    <div className="card" style={{marginBottom:16}}>
      <div className="sectionHead"><h2>직원 초대</h2><span className="badge">초대코드 방식</span></div>
      <form action={createEmployeeInvite} className="toolbar">
        <input className="input" name="name" placeholder="직원명" required />
        <input className="input" name="email" type="email" placeholder="이메일 (선택)" />
        <input className="input" name="team" placeholder="팀명 (예: 1팀)" />
        <button className="btn btnPrimary" type="submit">초대코드 발급</button>
      </form>
      <div className="muted" style={{fontSize:12,marginTop:10}}>직원은 회원가입/로그인 후 <strong>/join</strong>에서 초대코드를 입력하면 자신의 계정과 연결됩니다.</div>
    </div>

    <div className="card">
      <table className="dataTable"><thead><tr><th>직원</th><th>팀</th><th>계정</th><th>초대코드</th><th>상태</th><th>배정</th><th>완료</th><th>관리</th></tr></thead>
      <tbody>{(employees || []).map(e=><tr key={e.id}>
        <td><strong>{e.name}</strong><div className="muted" style={{fontSize:11}}>{e.invited_email || '-'}</div></td>
        <td>{e.team_id ? teamMap.get(e.team_id) || '-' : '-'}</td>
        <td><span className={`badge ${e.user_id?'badgeGreen':'badgeAmber'}`}>{e.user_id?'연결됨':'대기중'}</span></td>
        <td>{e.invite_code ? <code style={{fontWeight:800,letterSpacing:1}}>{e.invite_code}</code> : '-'}</td>
        <td><span className={`badge ${e.status==='ACTIVE'?'badgeGreen':'badgeAmber'}`}>{e.status}</span></td>
        <td>{assigned.get(e.id)||0}</td><td>{completed.get(e.id)||0}</td>
        <td><form action={setEmployeeStatus}><input type="hidden" name="id" value={e.id}/><input type="hidden" name="status" value={e.status==='ACTIVE'?'INACTIVE':'ACTIVE'}/><button className="btn" type="submit">{e.status==='ACTIVE'?'비활성':'활성화'}</button></form></td>
      </tr>)}</tbody></table>
      {(!employees || employees.length===0) && <div className="muted" style={{padding:22,textAlign:'center'}}>등록된 직원이 없습니다.</div>}
    </div>
  </main></div>
}
