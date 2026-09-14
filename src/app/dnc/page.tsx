import { PageShell } from '@/components/page-shell'
import { DncManager,DncReleaseButton } from '@/components/dnc-manager'
import { createClient } from '@/lib/supabase/server'

export default async function Page(){
  const supabase=await createClient()
  const {data:rows}=await supabase.from('do_not_call').select('id,phone_e164,reason,registration_type,registered_at,released_at,release_reason').order('registered_at',{ascending:false}).limit(300)
  return <PageShell title="수신거부 관리"><DncManager/><div className="card"><table className="dataTable"><thead><tr><th>전화번호</th><th>등록유형</th><th>사유</th><th>등록일</th><th>상태</th><th></th></tr></thead><tbody>{(rows||[]).map(r=><tr key={r.id}><td><strong>{r.phone_e164.replace(/(\d{3})\d+(\d{4})/,'$1-****-$2')}</strong></td><td>{r.registration_type}</td><td>{r.reason||'-'}</td><td>{new Date(r.registered_at).toLocaleString('ko-KR')}</td><td><span className={`badge ${r.released_at?'':'badgeAmber'}`}>{r.released_at?'해제':'차단중'}</span></td><td>{!r.released_at&&<DncReleaseButton id={r.id}/>}</td></tr>)}{(!rows||rows.length===0)&&<tr><td colSpan={6} className="muted">등록된 수신거부 번호가 없습니다.</td></tr>}</tbody></table></div></PageShell>
}
