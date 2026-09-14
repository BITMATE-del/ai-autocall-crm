import { createCompany } from './actions'

export default async function OnboardingPage({ searchParams }:{ searchParams: Promise<Record<string,string|undefined>> }) {
  const params = await searchParams
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#f4f7fb',padding:24}}>
    <form style={{width:'100%',maxWidth:520,background:'#fff',border:'1px solid #e4e9f1',borderRadius:18,padding:30,boxShadow:'0 16px 50px rgba(15,23,42,.08)'}}>
      <div style={{fontSize:12,fontWeight:800,color:'#2563eb',letterSpacing:1}}>FIRST SETUP</div>
      <h1 style={{margin:'8px 0 6px',fontSize:28}}>회사 관리자 설정</h1>
      <p style={{margin:'0 0 22px',color:'#64748b',fontSize:14}}>이 계정의 회사 공간을 만들고 최초 관리자 권한을 연결합니다.</p>
      {params.error && <div style={{padding:10,marginBottom:14,borderRadius:9,background:'#fee2e2',color:'#b91c1c',fontSize:13}}>회사 생성에 실패했습니다. 회사 ID(slug)가 이미 사용 중인지 확인해주세요.</div>}
      <label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:6}}>회사명</label>
      <input name="company_name" required placeholder="예: AutoCall Korea" style={{width:'100%',padding:'12px 13px',border:'1px solid #dbe2ea',borderRadius:10,marginBottom:14}} />
      <label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:6}}>회사 ID</label>
      <input name="slug" required placeholder="예: autocall-korea" pattern="[A-Za-z0-9-]+" style={{width:'100%',padding:'12px 13px',border:'1px solid #dbe2ea',borderRadius:10,marginBottom:14}} />
      <label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:6}}>관리자 이름</label>
      <input name="display_name" required placeholder="예: 김관리자" style={{width:'100%',padding:'12px 13px',border:'1px solid #dbe2ea',borderRadius:10,marginBottom:20}} />
      <button formAction={createCompany} style={{width:'100%',padding:13,border:0,borderRadius:10,background:'#2563eb',color:'#fff',fontWeight:800,cursor:'pointer'}}>회사 공간 생성</button>
    </form>
  </main>
}
