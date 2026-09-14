import { Sidebar } from '@/components/sidebar'
import { LeadImporter } from '@/components/lead-importer'
import { createClient } from '@/lib/supabase/server'

function maskPhone(v:string){
  const d=v.replace(/\D/g,'')
  if(d.length<8)return v
  return `${d.slice(0,3)}-${'*'.repeat(Math.max(4,d.length-7))}-${d.slice(-4)}`
}

export default async function Page(){
  const supabase=await createClient()
  const client=supabase as any
  const [{data:leads},{data:batches}]=await Promise.all([
    client.from('leads').select('id,customer_name,phone_e164,source,product_interest,status,created_at').is('deleted_at',null).order('created_at',{ascending:false}).limit(100),
    client.from('lead_import_batches').select('id,source_filename,total_rows,imported_rows,duplicate_rows,dnc_rows,invalid_rows,created_at').order('created_at',{ascending:false}).limit(8)
  ])
  return <div className="shell"><Sidebar/><main className="main">
    <div className="topbar"><div><div className="eyebrow">Database</div><h1 className="title">고객 DB</h1><div className="muted">원본 행을 별도 보존한 뒤 중복·수신거부·전화번호 오류를 판정하고 유효 고객만 운영 DB에 반영합니다.</div></div><LeadImporter/></div>
    <div className="grid">
      <div className="card"><div className="kpiLabel">현재 고객 DB</div><div className="kpi">{leads?.length??0}</div><div className="kpiFoot">최근 100건 기준 표시</div></div>
      <div className="card"><div className="kpiLabel">최근 업로드</div><div className="kpi">{batches?.[0]?.total_rows??0}</div><div className="kpiFoot">전체 행</div></div>
      <div className="card"><div className="kpiLabel">정상 반영</div><div className="kpi">{batches?.[0]?.imported_rows??0}</div><div className="kpiFoot">유효 고객</div></div>
      <div className="card"><div className="kpiLabel">제외</div><div className="kpi">{(batches?.[0]?.duplicate_rows??0)+(batches?.[0]?.dnc_rows??0)+(batches?.[0]?.invalid_rows??0)}</div><div className="kpiFoot">중복 / DNC / 오류</div></div>
    </div>
    <div className="card section"><div className="sectionHead"><h2>최근 고객</h2><span className="badge">최대 100건</span></div><table className="dataTable"><thead><tr><th>고객명</th><th>전화번호</th><th>유입처</th><th>관심상품</th><th>상태</th><th>등록일</th></tr></thead><tbody>{(leads??[]).map((r:any)=><tr key={r.id}><td><strong>{r.customer_name||'-'}</strong></td><td>{maskPhone(r.phone_e164)}</td><td>{r.source||'-'}</td><td>{r.product_interest||'-'}</td><td><span className="badge">{r.status}</span></td><td>{new Date(r.created_at).toLocaleString('ko-KR')}</td></tr>)}{!leads?.length&&<tr><td colSpan={6} className="muted">아직 등록된 고객이 없습니다.</td></tr>}</tbody></table></div>
    <div className="card section"><div className="sectionHead"><h2>업로드 이력</h2></div><table className="dataTable"><thead><tr><th>파일</th><th>전체</th><th>정상</th><th>중복</th><th>DNC</th><th>오류</th><th>업로드 시간</th></tr></thead><tbody>{(batches??[]).map((b:any)=><tr key={b.id}><td><strong>{b.source_filename||'-'}</strong></td><td>{b.total_rows}</td><td>{b.imported_rows}</td><td>{b.duplicate_rows}</td><td>{b.dnc_rows}</td><td>{b.invalid_rows}</td><td>{new Date(b.created_at).toLocaleString('ko-KR')}</td></tr>)}{!batches?.length&&<tr><td colSpan={7} className="muted">업로드 이력이 없습니다.</td></tr>}</tbody></table></div>
  </main></div>
}
