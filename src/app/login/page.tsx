import { login, signup } from './actions'

export default async function LoginPage({ searchParams }:{ searchParams: Promise<Record<string,string|undefined>> }) {
  const params = await searchParams
  const next=params.next&&params.next.startsWith('/')?params.next:'/dashboard'
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#0f172a',padding:24}}>
    <form style={{width:'100%',maxWidth:420,background:'#fff',borderRadius:18,padding:28,boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
      <input type="hidden" name="next" value={next}/>
      <div style={{fontSize:12,fontWeight:800,color:'#2563eb',letterSpacing:1}}>AI AUTOCALL CRM</div>
      <h1 style={{margin:'8px 0 6px',fontSize:28,color:'#172033'}}>관리자 로그인</h1>
      <p style={{margin:'0 0 22px',color:'#64748b',fontSize:14}}>회사별로 분리된 AutoCall CRM에 로그인합니다.</p>
      {params.reason==='session' && <div style={{padding:10,marginBottom:12,borderRadius:9,background:'#fff7ed',color:'#c2410c',fontSize:13}}>로그인 세션이 없거나 만료되었습니다. 로그인 후 발신 관리로 다시 이동합니다.</div>}
      {params.error && <div style={{padding:10,marginBottom:12,borderRadius:9,background:'#fee2e2',color:'#b91c1c',fontSize:13}}>이메일 또는 비밀번호를 확인해주세요.</div>}
      {params.check && <div style={{padding:10,marginBottom:12,borderRadius:9,background:'#dcfce7',color:'#166534',fontSize:13}}>가입 확인 메일을 확인한 뒤 로그인해주세요.</div>}
      <label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:6}}>이메일</label>
      <input name="email" type="email" required style={{width:'100%',padding:'12px 13px',border:'1px solid #dbe2ea',borderRadius:10,marginBottom:14}} />
      <label style={{display:'block',fontSize:13,fontWeight:700,marginBottom:6}}>비밀번호</label>
      <input name="password" type="password" minLength={8} required style={{width:'100%',padding:'12px 13px',border:'1px solid #dbe2ea',borderRadius:10,marginBottom:18}} />
      <button formAction={login} style={{width:'100%',padding:12,border:0,borderRadius:10,background:'#2563eb',color:'#fff',fontWeight:800,cursor:'pointer'}}>로그인</button>
      <button formAction={signup} style={{width:'100%',padding:12,border:'1px solid #dbe2ea',borderRadius:10,background:'#fff',color:'#172033',fontWeight:800,cursor:'pointer',marginTop:9}}>최초 관리자 가입</button>
    </form>
  </main>
}
