import { PageShell } from '@/components/page-shell'
import { GatewayAutoRefresh } from '@/components/gateway-auto-refresh'
import { GatewayTestCall } from '@/components/gateway-test-call'
import { createClient } from '@/lib/supabase/server'
import { addDevice, addOutboundLine, resetDevicePairing } from './actions'

function ago(value:string|null){
  if(!value) return '-'
  const sec=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000))
  if(sec<60) return `${sec}초 전`
  if(sec<3600) return `${Math.floor(sec/60)}분 전`
  return new Date(value).toLocaleString('ko-KR')
}

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const params=await searchParams
  const supabase=(await createClient()) as any
  const [{data:lines},{data:devices},{data:queue},{data:events}]=await Promise.all([
    supabase.from('outbound_lines').select('id,label,phone_e164,provider,status,verified,created_at').order('created_at',{ascending:false}),
    supabase.from('call_devices').select('id,name,device_type,status,last_seen_at,outbound_line_id,created_at,pairing_code,claimed_at,agent_version,model,android_version,battery_pct,charging,current_queue_id').order('created_at',{ascending:false}),
    supabase.from('call_queue').select('id,status,device_id,last_result,created_at').order('created_at',{ascending:false}).limit(500),
    supabase.from('gateway_device_events').select('id,device_id,queue_id,event_type,created_at').order('created_at',{ascending:false}).limit(30),
  ])

  const q=queue||[]
  const connected=(devices||[]).filter((d:any)=>d.last_seen_at&&Date.now()-new Date(d.last_seen_at).getTime()<30000).length
  const calling=(devices||[]).filter((d:any)=>['CALLING','BUSY'].includes(d.status)).length
  const waiting=q.filter((r:any)=>r.status==='QUEUED').length
  const completed=q.filter((r:any)=>r.status==='DONE').length
  const consented=q.filter((r:any)=>r.last_result==='CONSENTED').length
  const declined=q.filter((r:any)=>['DECLINED','DNC'].includes(r.last_result)).length

  return <PageShell title="발신 관리" eyebrow="Android Gateway">
    <GatewayAutoRefresh intervalMs={5000}/>
    <div className="topbar" style={{marginTop:-8}}>
      <div className="muted">표시 수치와 상태는 테스트 샘플이 아니라 현재 회사의 실제 DB/Agent 상태만 사용합니다.</div>
      <div className={`badge ${connected?'badgeGreen':'badgeAmber'}`}>연결 {connected} · 발신중 {calling}</div>
    </div>

    {params.ok&&<div className="card section" style={{padding:14,borderColor:'#86efac',background:'#f0fdf4',color:'#166534'}}><strong>완료</strong> · {params.ok}</div>}
    {params.error&&<div className="card section" style={{padding:14,borderColor:'#fecaca',background:'#fef2f2',color:'#b91c1c'}}><strong>처리 실패</strong> · {params.error}</div>}

    <GatewayTestCall registeredDevices={(devices||[]).length} onlineDevices={connected}/>

    <div className="grid section">
      <div className="card"><div className="kpiLabel">전체 Queue</div><div className="kpi">{q.length}</div></div>
      <div className="card"><div className="kpiLabel">동의</div><div className="kpi">{consented}</div></div>
      <div className="card"><div className="kpiLabel">미동의 / DNC</div><div className="kpi">{declined}</div></div>
      <div className="card"><div className="kpiLabel">대기</div><div className="kpi">{waiting}</div></div>
      <div className="card"><div className="kpiLabel">완료</div><div className="kpi">{completed}</div></div>
    </div>

    <div className="card section">
      <div className="sectionHead"><div><h2>단말 현황</h2><div className="muted">단말 등록 → APK 페어링 → ONLINE 확인 순서로 진행합니다.</div></div><span className="badge">{devices?.length||0}대</span></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:14}}>
        {(devices||[]).map((d:any)=>{
          const online=d.last_seen_at&&Date.now()-new Date(d.last_seen_at).getTime()<30000
          return <div key={d.id} className="card" style={{padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}>
              <strong>{d.name}</strong><span className={`badge ${online?'badgeGreen':'badgeAmber'}`}>{online?d.status:'OFFLINE'}</span>
            </div>
            <div className="muted" style={{fontSize:12,marginTop:8}}>{d.model||d.device_type} · Android {d.android_version||'-'} · Agent {d.agent_version||'-'}</div>
            <div style={{marginTop:12,fontSize:13,lineHeight:1.8}}>
              <div>배터리 <strong>{d.battery_pct==null?'-':`${d.battery_pct}%${d.charging?' ⚡':''}`}</strong></div>
              <div>최근 연결 <strong>{ago(d.last_seen_at)}</strong></div>
              <div>현재 작업 <strong>{d.current_queue_id?String(d.current_queue_id).slice(0,8):'-'}</strong></div>
              {!d.claimed_at&&<div>페어링 코드 <strong style={{letterSpacing:2}}>{d.pairing_code||'재발급 필요'}</strong></div>}
            </div>
            <form action={resetDevicePairing} style={{marginTop:12}}>
              <input type="hidden" name="device_id" value={d.id}/>
              <button className="btn" type="submit">페어링 초기화</button>
            </form>
          </div>
        })}
        {(!devices||devices.length===0)&&<div className="empty">등록된 Gateway 단말이 없습니다. 아래에서 실제 테스트할 Android 단말부터 등록하세요.</div>}
      </div>
    </div>

    <div className="split section">
      <form action={addOutboundLine} className="card">
        <div className="sectionHead"><h2>SIM / 발신번호 등록</h2></div>
        <div className="toolbar" style={{display:'grid'}}>
          <input className="input" name="label" placeholder="회선명 (예: 단말1 SIM)" required/>
          <input className="input" name="phone" placeholder="실제 사용권한이 있는 발신번호" required/>
          <input className="input" name="provider" placeholder="통신사 또는 알뜰폰 망 (선택)"/>
          <label className="muted" style={{fontSize:13}}><input type="checkbox" name="verified" required/> 실제 소유/사용권한 확인</label>
          <button className="btn btnPrimary" type="submit">회선 등록</button>
        </div>
      </form>
      <form action={addDevice} className="card">
        <div className="sectionHead"><h2>Gateway 단말 등록</h2></div>
        <div className="toolbar" style={{display:'grid'}}>
          <input className="input" name="name" placeholder="단말 이름 (예: 단말 1)" required/>
          <select className="select" name="device_type"><option value="ANDROID">Android Agent</option><option value="GATEWAY">Dedicated Gateway</option></select>
          <select className="select" name="line_id" required><option value="">발신번호 선택</option>{(lines||[]).map((l:any)=><option key={l.id} value={l.id}>{l.label} · {l.phone_e164}</option>)}</select>
          <button className="btn btnPrimary" type="submit" disabled={!lines?.length}>단말 등록 + 코드 발급</button>
          {!lines?.length&&<div className="muted" style={{fontSize:12}}>먼저 왼쪽에서 실제 SIM/발신번호를 등록해야 단말 등록 버튼이 활성화됩니다.</div>}
        </div>
      </form>
    </div>

    <div className="card section">
      <div className="sectionHead"><h2>최근 Gateway 이벤트</h2><span className="badge">자동 새로고침 5초</span></div>
      <table className="dataTable"><thead><tr><th>시간</th><th>단말</th><th>이벤트</th><th>Queue</th></tr></thead><tbody>
        {(events||[]).map((e:any)=><tr key={e.id}><td>{new Date(e.created_at).toLocaleString('ko-KR')}</td><td>{String(e.device_id).slice(0,8)}</td><td><span className="badge">{e.event_type}</span></td><td>{e.queue_id?String(e.queue_id).slice(0,8):'-'}</td></tr>)}
        {(!events||events.length===0)&&<tr><td colSpan={4}><div className="empty">실제 단말 이벤트가 아직 없습니다.</div></td></tr>}
      </tbody></table>
    </div>
  </PageShell>
}
