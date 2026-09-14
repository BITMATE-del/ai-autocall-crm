import { PageShell } from '@/components/page-shell'
import { createClient } from '@/lib/supabase/server'

export default async function Page(){
  const supabase=await createClient()
  const {data:scenarios}=await supabase.from('call_scenarios').select('id,name,description,active,current_version,updated_at').order('updated_at',{ascending:false}).limit(100)
  return <PageShell title="콜 시나리오" eyebrow="Automation"><div className="card"><div className="sectionHead"><div><h2>TTS / DTMF 시나리오</h2><div className="muted">버전 단위로 보존하며 1=동의, 2=DNC, 0=상담요청 흐름을 관리합니다.</div></div></div><table className="dataTable"><thead><tr><th>이름</th><th>버전</th><th>설명</th><th>상태</th><th>수정일</th></tr></thead><tbody>{(scenarios??[]).map(s=><tr key={s.id}><td><strong>{s.name}</strong></td><td>v{s.current_version}</td><td>{s.description??'-'}</td><td><span className="badge">{s.active?'ACTIVE':'OFF'}</span></td><td>{new Date(s.updated_at).toLocaleString('ko-KR')}</td></tr>)}</tbody></table>{!scenarios?.length&&<div className="empty">아직 시나리오가 없습니다. 실제 TTS 공급사 연결 전 기본 시나리오를 등록할 수 있습니다.</div>}</div></PageShell>
}
