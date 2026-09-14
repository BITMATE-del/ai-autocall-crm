import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { createClient } from '@/lib/supabase/server'
import { pauseAllCampaigns } from './actions'

function startOfToday(){const d=new Date();d.setHours(0,0,0,0);return d.toISOString()}
function mask(phone:string|null){if(!phone)return '-';const digits=phone.replace(/\D/g,'');return digits.length>=4?`****${digits.slice(-4)}`:'****'}

export default async function Page(){
  const supabase=(await createClient()) as any
  const today=startOfToday()
  const [
    {count:todayUploads},
    {count:todayCalls},
    {count:todayConsents},
    {count:unassignedPool},
    {data:devices},
    {data:runningCampaigns},
    {count:answeredCalls},
  ]=await Promise.all([
    supabase.from('leads').select('*',{count:'exact',head:true}).gte('created_at',today),
    supabase.from('call_queue').select('*',{count:'exact',head:true}).gte('created_at',today),
    supabase.from('consent_pool').select('*',{count:'exact',head:true}).gte('consented_at',today),
    supabase.from('consent_pool').select('*',{count:'exact',head:true}).is('current_assignee_id',null),
    supabase.from('call_devices').select('id,name,status,last_seen_at,outbound_line_id,outbound_lines(phone_e164)').order('created_at',{ascending:false}).limit(8),
    supabase.from('call_campaigns').select('id,status').in('status',['RUNNING','ACTIVE']),
    supabase.from('call_queue').select('*',{count:'exact',head:true}).gte('created_at',today).in('status',['ANSWERED','CONNECTED','DONE']),
  ])

  const upload=todayUploads||0
  const calls=todayCalls||0
  const consents=todayConsents||0
  const pool=unassignedPool||0
  const answered=answeredCalls||0
  const consentRate=answered>0?((consents/answered)*100).toFixed(1):'0.0'
  const online=(devices||[]).filter((d:any)=>d.last_seen_at&&Date.now()-new Date(d.last_seen_at).getTime()<30000).length

  return <div className="shell"><Sidebar/><main className="main">
    <div className="topbar">
      <div><div className="eyebrow">Operations</div><h1 className="title">관리자 대시보드</h1><div className="muted">모든 수치는 현재 회사의 실제 Supabase 데이터입니다.</div></div>
      <div className="topActions">
        <form action={pauseAllCampaigns}><button className="btn" type="submit" disabled={!runningCampaigns?.length}>전체 일시정지</button></form>
        <Link className="btn btnPrimary" href="/calls">1차콜 운영</Link>
      </div>
    </div>

    <div className="grid">
      <div className="card"><div className="kpiLabel">오늘 업로드</div><div className="kpi">{upload.toLocaleString()}</div><div className="kpiFoot">실제 등록 고객</div></div>
      <div className="card"><div className="kpiLabel">오늘 발신 Queue</div><div className="kpi">{calls.toLocaleString()}</div><div className="kpiFoot">연결/완료 {answered.toLocaleString()}건</div></div>
      <div className="card"><div className="kpiLabel">오늘 동의</div><div className="kpi">{consents.toLocaleString()}</div><div className="kpiFoot">동의율 {consentRate}%</div></div>
      <div className="card"><div className="kpiLabel">중앙 미배정</div><div className="kpi">{pool.toLocaleString()}</div><div className="kpiFoot">현재 Pool 기준</div></div>
    </div>

    <div className="split section">
      <div className="card">
        <div className="sectionHead"><h2>Gateway 단말 상태</h2><span className={`badge ${online?'badgeGreen':'badgeAmber'}`}>{online} Online</span></div>
        <table className="dataTable"><thead><tr><th>단말</th><th>발신번호</th><th>상태</th><th>최근 연결</th></tr></thead><tbody>
          {(devices||[]).map((d:any)=>{
            const isOnline=d.last_seen_at&&Date.now()-new Date(d.last_seen_at).getTime()<30000
            const line=Array.isArray(d.outbound_lines)?d.outbound_lines[0]:d.outbound_lines
            return <tr key={d.id}><td><strong>{d.name}</strong></td><td>{mask(line?.phone_e164||null)}</td><td><span className={`badge ${isOnline?'badgeGreen':'badgeAmber'}`}>{isOnline?d.status:'OFFLINE'}</span></td><td>{d.last_seen_at?new Date(d.last_seen_at).toLocaleString('ko-KR'):'-'}</td></tr>
          })}
          {(!devices||devices.length===0)&&<tr><td colSpan={4}><div className="empty">실제 등록된 단말이 없습니다. <Link href="/devices">단말을 등록하세요.</Link></div></td></tr>}
        </tbody></table>
      </div>
      <div className="card">
        <div className="sectionHead"><h2>실운영 준비 상태</h2></div>
        <div className="metricRow"><strong>회사 계정</strong><strong>연결됨</strong></div>
        <div className="metricRow"><strong>Gateway 단말</strong><strong>{devices?.length||0}대</strong></div>
        <div className="metricRow"><strong>온라인 단말</strong><strong>{online}대</strong></div>
        <div className="metricRow"><strong>실행 중 캠페인</strong><strong>{runningCampaigns?.length||0}개</strong></div>
        <div style={{marginTop:16}}><Link className="btn btnPrimary" href="/devices">실발신 준비/테스트</Link></div>
      </div>
    </div>
  </main></div>
}
