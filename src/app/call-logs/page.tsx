import { PageShell } from '@/components/page-shell'
import { createClient } from '@/lib/supabase/server'

export default async function Page(){
 const supabase=await createClient();
 const {data:logs}=await supabase.from('call_logs').select('id,provider,status,provider_call_id,duration_seconds,dtmf_value,recording_url,created_at,leads(customer_name,phone_e164),call_campaigns(name)').order('created_at',{ascending:false}).limit(300)
 return <PageShell title="통화이력" eyebrow="Telephony"><div className="card"><table className="dataTable"><thead><tr><th>시간</th><th>캠페인</th><th>고객</th><th>Provider</th><th>결과</th><th>DTMF</th><th>통화시간</th><th>녹취</th></tr></thead><tbody>{(logs??[]).map((r:any)=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString('ko-KR')}</td><td>{r.call_campaigns?.name??'-'}</td><td>{r.leads?.customer_name??'-'} / {r.leads?.phone_e164?.replace(/.(?=.{4})/g,'*')??'-'}</td><td>{r.provider??'-'}</td><td><span className="badge">{r.status}</span></td><td>{r.dtmf_value??'-'}</td><td>{r.duration_seconds??0}s</td><td>{r.recording_url?<a href={r.recording_url} target="_blank" rel="noreferrer">열기</a>:'-'}</td></tr>)}</tbody></table>{!logs?.length&&<div className="empty">통화이력이 없습니다.</div>}</div></PageShell>
}
