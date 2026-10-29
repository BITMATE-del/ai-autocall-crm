"use client";
import {useEffect,useState} from "react";
import TelegramPairing from "@/components/TelegramPairing";
type State={connected:boolean;count:number};
export default function Page(){
 const [state,setState]=useState<State|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function check(){
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/partner/telegram/check",{cache:"no-store"});
   const j=await r.json().catch(()=>null);
   if(!r.ok||!j)throw Error("연결 상태를 확인할 수 없습니다.");
   setState(j);
  }catch(e){setMessage(e instanceof Error?e.message:"조회 실패")}finally{setBusy(false)}
 }
 async function test(){
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/partner/telegram/check",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
   const j=await r.json().catch(()=>null);
   if(!r.ok||!j?.ok)throw Error(j?.error==="NOT_LINKED"?"먼저 텔레그램을 연결해 주세요.":"테스트 발송에 실패했습니다. 연결 상태를 확인해 주세요.");
   setMessage("테스트 메시지 발송 성공 ("+j.sent+"건)");
  }catch(e){setMessage(e instanceof Error?e.message:"테스트 실패")}finally{setBusy(false)}
 }
 useEffect(()=>{void check()},[]);
 return <><h1>담당 회원 텔레그램 알림</h1>
 <section style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,padding:22,maxWidth:630,marginBottom:16}}>
  <h2 style={{fontSize:17,marginTop:0}}>내 알림 연결 상태</h2>
  <p style={{fontSize:14,color:"#475569"}}>{state===null?"연결 확인 중":state.connected?"연결된 채팅 "+state.count+"개":"연결된 텔레그램 채팅이 없습니다."}</p>
  <div style={{display:"flex",flexWrap:"wrap",gap:9}}>
   <button type="button" disabled={busy} onClick={check} style={{padding:"10px 13px",borderRadius:8,border:"1px solid #cbd5e1",background:"#fff",cursor:"pointer"}}>연결 상태 확인</button>
   <button type="button" disabled={busy||!state?.connected} onClick={test} style={{padding:"10px 13px",borderRadius:8,border:0,background:"#bf2032",color:"#fff",cursor:"pointer",opacity:busy||!state?.connected?.6:1}}>테스트 알림 보내기</button>
  </div>
  {message&&<p role="status" style={{fontSize:13,marginTop:13,color:message.includes("성공")?"#16804a":"#b42338"}}>{message}</p>}
 </section>
 <TelegramPairing/></>
}