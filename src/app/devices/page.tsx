import { PageShell } from '@/components/page-shell'
import { createClient } from '@/lib/supabase/server'
import { addDevice, addOutboundLine } from './actions'

export default async function Page(){
  const supabase=await createClient()
  const [{data:lines},{data:devices}]=await Promise.all([
    supabase.from('outbound_lines').select('id,label,phone_e164,provider,status,verified,created_at').order('created_at',{ascending:false}),
    supabase.from('call_devices').select('id,name,device_type,status,last_seen_at,outbound_line_id,created_at').order('created_at',{ascending:false}),
  ])

  return <PageShell title="발신번호 / 단말" eyebrow="Telephony">
    <div className="split">
      <form action={addOutboundLine} className="card">
        <div className="sectionHead"><h2>발신번호 등록</h2></div>
        <div className="toolbar" style={{display:'grid'}}>
          <input className="input" name="label" placeholder="회선명 (예: 서울 1번 회선)" required/>
          <input className="input" name="phone" placeholder="발신번호 (예: +82212345678)" required/>
          <input className="input" name="provider" placeholder="통신사 / 공급사"/>
          <label className="muted" style={{fontSize:13}}><input type="checkbox" name="verified"/> 실제 소유/사용권한이 확인된 번호</label>
          <button className="btn btnPrimary" type="submit">발신번호 등록</button>
        </div>
      </form>
      <form action={addDevice} className="card">
        <div className="sectionHead"><h2>단말 등록</h2></div>
        <div className="toolbar" style={{display:'grid'}}>
          <input className="input" name="name" placeholder="단말 이름" required/>
          <select className="select" name="device_type"><option value="SIP">SIP</option><option value="ANDROID">Android</option><option value="GATEWAY">Gateway</option></select>
          <select className="select" name="line_id"><option value="">발신번호 미지정</option>{(lines||[]).map(l=><option key={l.id} value={l.id}>{l.label} · {l.phone_e164}</option>)}</select>
          <button className="btn btnPrimary" type="submit">단말 등록</button>
        </div>
      </form>
    </div>

    <div className="card section">
      <div className="sectionHead"><h2>등록 발신번호</h2><span className="badge">{lines?.length||0}개</span></div>
      <table className="dataTable"><thead><tr><th>회선명</th><th>번호</th><th>공급사</th><th>검증</th><th>상태</th></tr></thead><tbody>
        {(lines||[]).map(l=><tr key={l.id}><td><strong>{l.label}</strong></td><td>{l.phone_e164}</td><td>{l.provider||'-'}</td><td><span className={`badge ${l.verified?'badgeGreen':'badgeAmber'}`}>{l.verified?'VERIFIED':'UNVERIFIED'}</span></td><td>{l.status}</td></tr>)}
      </tbody></table>
    </div>

    <div className="card section">
      <div className="sectionHead"><h2>단말 상태</h2><span className="badge">{devices?.length||0}대</span></div>
      <table className="dataTable"><thead><tr><th>단말</th><th>종류</th><th>상태</th><th>마지막 연결</th></tr></thead><tbody>
        {(devices||[]).map(d=><tr key={d.id}><td><strong>{d.name}</strong></td><td>{d.device_type}</td><td><span className={`badge ${d.status==='ONLINE'?'badgeGreen':'badgeAmber'}`}>{d.status}</span></td><td>{d.last_seen_at?new Date(d.last_seen_at).toLocaleString('ko-KR'):'-'}</td></tr>)}
      </tbody></table>
    </div>
  </PageShell>
}
