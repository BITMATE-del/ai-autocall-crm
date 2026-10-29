"use client";
import {useEffect,useState} from "react";
type Code={id:string;code:string;status:string;username:string};
const signup=(code:string)=>"https://hfmtrade.co.kr/auth?ref="+encodeURIComponent(code);
export default function Referrals(){
 const [codes,setCodes]=useState<Code[]>([]),[customCode,setCustomCode]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function load(){try{
  const cr=await fetch("/api/admin/referrals",{cache:"no-store"});
  const cj=await cr.json().catch(()=>null);
  if(!cr.ok||!cj)throw Error(cj?.error==="FORBIDDEN"?"본사에서 추천코드 발급 또는 관리 권한을 부여해야 합니다.":cj?.error||"추천코드 조회에 실패했습니다.");
  setCodes(cj.codes||[]);
 }catch(e){setError(e instanceof Error?e.message:"조회 실패")}}
 useEffect(()=>{void load()},[]);
 async function issue(){if(busy)return;const code=customCode.trim().toUpperCase();if(!/^[A-Z0-9_-]{4,24}$/.test(code)){setError("추천코드는 영문·숫자·하이픈·밑줄로 4~24자 입력해 주세요.");return;}
  setBusy(true);setError("");setMessage("");
  try{const r=await fetch("/api/admin/referrals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code})});
   const j=await r.json().catch(()=>null);if(!r.ok||!j)throw Error(j?.error==="CODE_ALREADY_EXISTS"?"이미 사용 중인 추천코드입니다.":j?.error==="SELF_ISSUE_ONLY"?"본인 조직의 추천코드만 생성할 수 있습니다.":j?.error==="FORBIDDEN"?"추천코드 발급 권한이 없습니다. 본사에서 권한을 부여해야 합니다.":j?.error||"추천코드 생성에 실패했습니다.");
   setMessage("추천코드 "+j.code+" 생성 완료");setCustomCode("");await load();
  }catch(e){setError(e instanceof Error?e.message:"발급 실패")}finally{setBusy(false)}
 }
 async function setStatus(id:string,status:string){if(!confirm("추천코드 상태를 변경하시겠습니까?"))return;
  setBusy(true);setError("");try{const r=await fetch("/api/admin/referrals",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});if(!r.ok)throw Error((await r.json()).error);await load()}catch(e){setError(e instanceof Error?e.message:"수정 실패")}finally{setBusy(false)}
 }
 return <><div className="hpPageHeading"><h1>추천코드 관리</h1><p>회원가입 시 입력할 추천코드를 발급하고 소속 회원을 관리합니다.</p></div>
 {error&&<p role="alert" style={{color:"#b34752"}}>{error}</p>}{message&&<p role="status" style={{color:"#167a4b"}}>{message}</p>}
 <section className="hpCard" style={{marginBottom:16}}>
  <h2 style={{fontSize:17,marginTop:0}}>회원가입 추천코드 생성</h2>
  <p style={{fontSize:13,color:"#64748b"}}>원하는 코드를 직접 입력하세요. 생성된 코드는 내 조직에만 귀속됩니다.</p>
  <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:10}}>
   <input aria-label="추천코드 입력" value={customCode} onChange={e=>setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,24))} placeholder="예: HFM2026" maxLength={24} autoComplete="off" style={{padding:"11px 13px",minWidth:230,border:"1px solid #dce3ec",borderRadius:8}}/>
   <button type="button" onClick={issue} disabled={busy||customCode.length<4} style={{padding:"11px 20px",border:0,borderRadius:8,background:"#3468ba",color:"white",fontWeight:700,opacity:busy||customCode.length<4?0.6:1}}>{busy?"처리 중":"추천코드 생성"}</button>
  </div>
  <p style={{fontSize:12,color:"#64748b"}}>영문·숫자·하이픈(-)·밑줄(_) 4~24자 · 다른 조직에서 사용 중인 코드는 생성 불가</p>
 </section>
 <section className="hpCard"><h2 style={{fontSize:17,marginTop:0}}>발급된 코드</h2>
 {codes.map(c=><div key={c.id} style={{borderBottom:"1px solid #e6eaf0",padding:"15px 0",display:"flex",gap:12,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
  <div><strong style={{fontSize:16}}>{c.code}</strong><p style={{fontSize:13,color:"#64748b",margin:"5px 0"}}>{c.username} · {c.status==="ACTIVE"?"사용 가능":"비활성"}</p><div style={{fontSize:12,overflowWrap:"anywhere"}}>{signup(c.code)}</div></div>
  <div style={{display:"flex",gap:8}}><button onClick={()=>navigator.clipboard.writeText(signup(c.code))}>가입 링크 복사</button><button disabled={busy} onClick={()=>setStatus(c.id,c.status==="ACTIVE"?"DISABLED":"ACTIVE")}>{c.status==="ACTIVE"?"비활성화":"활성화"}</button></div>
 </div>)}
 {!codes.length&&<p style={{color:"#64748b"}}>아직 발급된 추천코드가 없습니다.</p>}</section></>
}