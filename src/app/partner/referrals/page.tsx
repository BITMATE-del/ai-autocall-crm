"use client";
import {useEffect,useState} from "react";
type Code={id:string;code:string;status:string;username:string};
type Org={id:string;name:string;type:string;user_id:string;status:string};
const signup=(code:string)=>"https://hfmtrade.co.kr/auth?ref="+encodeURIComponent(code);
export default function Referrals(){
 const [codes,setCodes]=useState<Code[]>([]),[agents,setAgents]=useState<Org[]>([]),[selected,setSelected]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function load(){try{
  const [cr,ar]=await Promise.all([fetch("/api/admin/referrals",{cache:"no-store"}),fetch("/api/admin/organizations",{cache:"no-store"})]);
  const cj=await cr.json(),aj=await ar.json();if(!cr.ok)throw Error(cj.error||"추천코드 조회 실패");
  setCodes(cj.codes||[]);
  if(ar.ok)setAgents((aj.organizations||[]).filter((x:Org)=>x.type==="AGENT"&&x.status==="ACTIVE"&&x.user_id));
  else setAgents([]);
 }catch(e){setError(e instanceof Error?e.message:"조회 실패")}}
 useEffect(()=>{void load()},[]);
 async function issue(){const org=agents.find(x=>x.id===selected);if(!org||busy)return;
  setBusy(true);setError("");setMessage("");
  try{const r=await fetch("/api/admin/referrals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({agentId:org.user_id,organizationId:org.id})});
   const j=await r.json();if(!r.ok)throw Error(j.error||"발급 실패");
   setMessage("추천코드 "+j.code+" 발급 완료");await load();
  }catch(e){setError(e instanceof Error?e.message:"발급 실패")}finally{setBusy(false)}
 }
 async function setStatus(id:string,status:string){if(!confirm("추천코드 상태를 변경하시겠습니까?"))return;
  setBusy(true);setError("");try{const r=await fetch("/api/admin/referrals",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});if(!r.ok)throw Error((await r.json()).error);await load()}catch(e){setError(e instanceof Error?e.message:"수정 실패")}finally{setBusy(false)}
 }
 return <><div className="hpPageHeading"><h1>추천코드 관리</h1><p>소속 영업자에게 회원가입 추천코드를 발급하고 관리합니다.</p></div>
 {error&&<p role="alert" style={{color:"#bf2032"}}>{error}</p>}{message&&<p role="status" style={{color:"#167a4b"}}>{message}</p>}
 <section className="hpCard" style={{marginBottom:16}}>
  <h2 style={{fontSize:17,marginTop:0}}>새 추천코드 발급</h2>
  <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:10}}>
   <select aria-label="영업자 선택" value={selected} onChange={e=>setSelected(e.target.value)} style={{padding:"11px 13px",minWidth:230,border:"1px solid #dce3ec",borderRadius:8}}>
    <option value="">소속 영업자 선택</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name} ({a.id.slice(0,8)})</option>)}
   </select>
   <button type="button" onClick={issue} disabled={!selected||busy} style={{padding:"11px 20px",border:0,borderRadius:8,background:"#bd2034",color:"white",fontWeight:700,opacity:(!selected||busy)?0.6:1}}>{busy?"처리 중":"추천코드 발급"}</button>
  </div>
  {!agents.length&&<p style={{fontSize:13,color:"#64748b"}}>발급 가능한 소속 영업자가 없습니다. 먼저 영업자를 생성하거나 추천코드 발급 권한을 확인하세요.</p>}
 </section>
 <section className="hpCard"><h2 style={{fontSize:17,marginTop:0}}>발급된 코드</h2>
 {codes.map(c=><div key={c.id} style={{borderBottom:"1px solid #e6eaf0",padding:"15px 0",display:"flex",gap:12,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
  <div><strong style={{fontSize:16}}>{c.code}</strong><p style={{fontSize:13,color:"#64748b",margin:"5px 0"}}>{c.username} · {c.status==="ACTIVE"?"사용 가능":"비활성"}</p><div style={{fontSize:12,overflowWrap:"anywhere"}}>{signup(c.code)}</div></div>
  <div style={{display:"flex",gap:8}}><button onClick={()=>navigator.clipboard.writeText(signup(c.code))}>가입 링크 복사</button><button disabled={busy} onClick={()=>setStatus(c.id,c.status==="ACTIVE"?"DISABLED":"ACTIVE")}>{c.status==="ACTIVE"?"비활성화":"활성화"}</button></div>
 </div>)}
 {!codes.length&&<p style={{color:"#64748b"}}>아직 발급된 추천코드가 없습니다.</p>}</section></>
}