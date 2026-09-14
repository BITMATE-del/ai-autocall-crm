import { PageShell } from '@/components/page-shell'
import { createClient } from '@/lib/supabase/server'
import { createCampaign, enqueueCampaign, recordResult } from './actions'

function mask(v:string){const d=v.replace(/\D/g,''); if(d.length<8)return v; return `${d.slice(0,3)}-****-${d.slice(-4)}`}

export default async function Page(){
  const supabase=await createClient()
  const [{data:campaigns},{data:lines},{data:queue}]=await Promise.all([
    supabase.from('call_campaigns').select('id,name,product,status,daily_limit,outbound_line_id,created_at').order('created_at',{ascending:false}),
    supabase.from('outbound_lines').select('id,label,phone_e164,verified,status').eq('status','ACTIVE').order('created_at',{ascending:false}),
    supabase.from('call_queue').select('id,status,attempt_count,last_attempt_at,created_at,campaign_id,lead_id,leads(customer_name,phone_e164,product_interest,source)').order('created_at',{ascending:false}).limit(100),
  ])

  const queued=(queue||[]).filter(q=>q.status==='QUEUED').length
  const consented=(queue||[]).filter(q=>q.status==='CONSENTED').length
  const connected=(queue||[]).filter(q=>['ANSWERED','CONSENTED','DECLINED','DNC'].includes(q.status)).length

  return <PageShell title="1차콜 캠페인" eyebrow="Outbound">
    <div className="grid">
      <div className="card"><div className="kpiLabel">캠페인</div><div className="kpi">{campaigns?.length||0}</div></div>
      <div className="card"><div className="kpiLabel">대기 큐</div><div className="kpi">{queued}</div></div>
      <div className="card"><div className="kpiLabel">연결 결과</div><div className="kpi">{connected}</div></div>
      <div className="card"><div className="kpiLabel">동의 완료</div><div className="kpi">{consented}</div></div>
    </div>

    <div className="split section">
      <form action={createCampaign} className="card">
        <div className="sectionHead"><h2>새 캠페인</h2></div>
        <div style={{display:'grid',gap:9}}>
          <input className="input" name="name" placeholder="캠페인명" required/>
          <input className="input" name="product" placeholder="상품 / 목적"/>
          <select className="select" name="line_id"><option value="">발신번호 미지정</option>{(lines||[]).map(l=><option key={l.id} value={l.id} disabled={!l.verified}>{l.label} · {l.phone_e164}{l.verified?'':' (미검증)'}</option>)}</select>
          <input className="input" name="daily_limit" type="number" min="0" defaultValue="500" placeholder="일 최대 건수"/>
          <button className="btn btnPrimary" type="submit">캠페인 생성</button>
        </div>
      </form>
      <div className="card">
        <div className="sectionHead"><h2>운영 원칙</h2></div>
        <div className="muted" style={{fontSize:13,lineHeight:1.7}}>등록·검증된 발신번호만 사용합니다. 통신사 또는 콜 공급사 연동 전에는 큐와 결과만 CRM에서 관리되며 실제 PSTN/SIP 발신은 발생하지 않습니다. DNC 고객은 큐 적재 단계에서 제외됩니다.</div>
      </div>
    </div>

    <div className="card section">
      <div className="sectionHead"><h2>캠페인 목록</h2></div>
      <table className="dataTable"><thead><tr><th>캠페인</th><th>상품</th><th>상태</th><th>일 한도</th><th>큐 적재</th></tr></thead><tbody>
        {(campaigns||[]).map(c=><tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.product||'-'}</td><td><span className={`badge ${c.status==='RUNNING'?'badgeGreen':'badgeAmber'}`}>{c.status}</span></td><td>{c.daily_limit||'-'}</td><td><form action={enqueueCampaign} className="toolbar"><input type="hidden" name="campaign_id" value={c.id}/><input className="input" style={{width:100}} name="limit" type="number" min="1" max="5000" defaultValue="100"/><button className="btn" type="submit">DB 적재</button></form></td></tr>)}
      </tbody></table>
    </div>

    <div className="card section">
      <div className="sectionHead"><h2>발신 큐 / 결과입력</h2><span className="badge">최근 100건</span></div>
      <table className="dataTable"><thead><tr><th>고객</th><th>전화번호</th><th>상품</th><th>유입처</th><th>상태</th><th>시도</th><th>결과</th></tr></thead><tbody>
        {(queue||[]).map(q=>{const lead=Array.isArray(q.leads)?q.leads[0]:q.leads as any; return <tr key={q.id}><td><strong>{lead?.customer_name||'-'}</strong></td><td>{lead?.phone_e164?mask(lead.phone_e164):'-'}</td><td>{lead?.product_interest||'-'}</td><td>{lead?.source||'-'}</td><td><span className={`badge ${q.status==='CONSENTED'?'badgeGreen':q.status==='QUEUED'?'badgeAmber':''}`}>{q.status}</span></td><td>{q.attempt_count}</td><td>{['CONSENTED','DECLINED','DNC','CANCELED'].includes(q.status)?'-':<form action={recordResult} className="toolbar"><input type="hidden" name="queue_id" value={q.id}/><select className="select" name="result" defaultValue="ANSWERED"><option>ANSWERED</option><option>NO_ANSWER</option><option>BUSY</option><option>CONSENTED</option><option>DECLINED</option><option>DNC</option><option>FAILED</option><option>CANCELED</option></select><button className="btn" type="submit">저장</button></form>}</td></tr>})}
      </tbody></table>
    </div>
  </PageShell>
}
