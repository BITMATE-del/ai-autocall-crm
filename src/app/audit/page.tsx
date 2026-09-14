import { PageShell } from '@/components/page-shell'
import { createClient } from '@/lib/supabase/server'

export default async function Page(){
  const supabase=await createClient()
  const {data:logs}=await supabase.from('audit_logs').select('id,action,target_type,target_id,user_id,created_at,after_data').order('created_at',{ascending:false}).limit(300)
  return <PageShell title="감사로그"><div className="card"><div className="sectionHead"><h2>중요 작업 기록</h2><span className="muted">최근 300건</span></div><table className="dataTable"><thead><tr><th>시간</th><th>작업</th><th>대상</th><th>사용자</th><th>세부정보</th></tr></thead><tbody>{(logs||[]).map(l=><tr key={l.id}><td>{new Date(l.created_at).toLocaleString('ko-KR')}</td><td><strong>{l.action}</strong></td><td>{l.target_type||'-'} {l.target_id?String(l.target_id).slice(0,8):''}</td><td>{l.user_id?String(l.user_id).slice(0,8):'-'}</td><td><code style={{fontSize:11,whiteSpace:'pre-wrap'}}>{l.after_data?JSON.stringify(l.after_data):'-'}</code></td></tr>)}{(!logs||logs.length===0)&&<tr><td colSpan={5} className="muted">감사로그가 없습니다.</td></tr>}</tbody></table></div></PageShell>
}
