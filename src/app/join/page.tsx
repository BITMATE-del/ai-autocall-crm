import { claimInvite } from './actions'

export default async function JoinPage({searchParams}:{searchParams:Promise<{error?:string}>}){
  const params = await searchParams
  return <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24}}>
    <div className="card" style={{width:'100%',maxWidth:460}}>
      <div className="eyebrow">Employee Join</div>
      <h1 className="title">직원 계정 연결</h1>
      <p className="muted" style={{marginBottom:18}}>관리자에게 받은 초대코드를 입력하면 현재 로그인한 계정이 회사 직원으로 연결됩니다.</p>
      {params.error && <div style={{padding:12,border:'1px solid #fecaca',background:'#fff1f2',borderRadius:9,marginBottom:12,fontSize:13}}>{params.error}</div>}
      <form action={claimInvite} style={{display:'grid',gap:10}}>
        <input className="input" name="code" placeholder="초대코드" autoComplete="off" required style={{textTransform:'uppercase',fontWeight:800,letterSpacing:2}} />
        <button className="btn btnPrimary" type="submit">직원 계정 연결</button>
      </form>
    </div>
  </main>
}
