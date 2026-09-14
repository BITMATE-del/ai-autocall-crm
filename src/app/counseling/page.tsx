import { Sidebar } from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'
import { saveCounselingResult } from './actions'

export const dynamic = 'force-dynamic'

function maskPhone(phone:string){
  if(!phone) return '-'
  const digits=phone.replace(/\D/g,'')
  if(digits.length<8) return phone
  return `${digits.slice(0,3)}-****-${digits.slice(-4)}`
}

export default async function Page(){
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const uid = claims?.claims?.sub as string | undefined
  const { data: profile } = uid ? await supabase.from('autocall_profiles').select('role,display_name,company_id').eq('id',uid).maybeSingle() : {data:null}
  const { data: employee } = uid ? await supabase.from('employees').select('id,name,status').eq('user_id',uid).maybeSingle() : {data:null}

  if(!employee){
    return <div className="shell"><Sidebar/><main className="main"><div className="topbar"><div><div className="eyebrow">2nd Call CRM</div><h1 className="title">2차콜 CRM</h1><div className="muted">직원 계정으로 연결된 사용자만 상담 화면을 사용할 수 있습니다.</div></div></div><div className="card"><p className="muted">현재 권한: {profile?.role || '미설정'}</p><p>직원으로 사용할 계정이라면 관리자에게 받은 초대코드로 <strong>/join</strong>에서 계정을 연결하세요.</p></div></main></div>
  }

  const [{ data: leads }, { data: callbacks }, { data: logs }] = await Promise.all([
    supabase.from('leads').select('id,customer_name,phone_e164,source,campaign_name,product_interest,region,memo,status,updated_at').eq('current_assignee_id',employee.id).order('updated_at',{ascending:false}),
    supabase.from('callbacks').select('lead_id,scheduled_at,status,note').eq('employee_id',employee.id).eq('status','SCHEDULED').order('scheduled_at',{ascending:true}),
    supabase.from('counseling_logs').select('lead_id,status,memo,callback_at,created_at').eq('employee_id',employee.id).order('created_at',{ascending:false}),
  ])
  const callbackMap = new Map((callbacks||[]).map(c=>[c.lead_id,c]))
  const latestLog = new Map<string,any>()
  for(const log of logs||[]) if(!latestLog.has(log.lead_id)) latestLog.set(log.lead_id,log)
  const openCount=(leads||[]).filter(l=>!['COMPLETED','REJECTED'].includes(l.status)).length
  const callbackCount=(callbacks||[]).length
  const completedCount=(leads||[]).filter(l=>l.status==='COMPLETED').length

  return <div className="shell"><Sidebar/><main className="main">
    <div className="topbar"><div><div className="eyebrow">2nd Call CRM</div><h1 className="title">2차콜 CRM</h1><div className="muted">{employee.name}님의 배정 고객만 표시됩니다.</div></div></div>
    <div className="grid">
      <div className="card"><div className="kpiLabel">전체 배정</div><div className="kpi">{(leads||[]).length}</div></div>
      <div className="card"><div className="kpiLabel">상담 대기</div><div className="kpi">{openCount}</div></div>
      <div className="card"><div className="kpiLabel">재통화 예약</div><div className="kpi">{callbackCount}</div></div>
      <div className="card"><div className="kpiLabel">상담 완료</div><div className="kpi">{completedCount}</div></div>
    </div>

    <div className="section" style={{display:'grid',gap:14}}>
      {(leads||[]).map(lead=>{
        const cb=callbackMap.get(lead.id)
        const last=latestLog.get(lead.id)
        return <div className="card" key={lead.id}>
          <div className="sectionHead"><div><h2>{lead.customer_name || '이름 없음'} · {maskPhone(lead.phone_e164)}</h2><div className="muted" style={{fontSize:12,marginTop:4}}>{lead.product_interest || '-'} · {lead.source || '-'} · {lead.campaign_name || '-'}</div></div><span className={`badge ${lead.status==='COMPLETED'?'badgeGreen':lead.status==='CALLBACK'?'badgeAmber':''}`}>{lead.status}</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10,margin:'14px 0'}}>
            <div><div className="kpiLabel">지역</div><strong>{lead.region || '-'}</strong></div>
            <div><div className="kpiLabel">기존 메모</div><strong>{lead.memo || '-'}</strong></div>
            <div><div className="kpiLabel">최근 상담</div><strong>{last?.status || '-'}</strong></div>
            <div><div className="kpiLabel">재통화</div><strong>{cb ? new Date(cb.scheduled_at).toLocaleString('ko-KR') : '-'}</strong></div>
          </div>
          <form action={saveCounselingResult} style={{display:'grid',gridTemplateColumns:'160px 220px 1fr auto',gap:8,alignItems:'center'}}>
            <input type="hidden" name="lead_id" value={lead.id}/>
            <select className="select" name="status" defaultValue={lead.status==='CALLBACK'?'CALLBACK':'IN_COUNSELING'}>
              <option value="IN_COUNSELING">상담중</option><option value="CALLBACK">재통화</option><option value="COMPLETED">상담완료</option><option value="REJECTED">상담거절</option>
            </select>
            <input className="input" type="datetime-local" name="callback_at" />
            <input className="input" name="memo" placeholder="상담 메모" defaultValue={last?.memo || ''}/>
            <button className="btn btnPrimary" type="submit">결과 저장</button>
          </form>
        </div>
      })}
      {(!leads || leads.length===0) && <div className="card"><div className="muted" style={{padding:28,textAlign:'center'}}>현재 배정된 고객이 없습니다.</div></div>}
    </div>
  </main></div>
}
