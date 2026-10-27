"use client";
import {useState} from "react";
import TelegramPairing from "@/components/TelegramPairing";
export default function Page(){
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 async function setup(){
  setBusy(true);setStatus("");
  try{const r=await fetch("/api/admin/telegram/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
   const j=await r.json();if(!r.ok)throw Error(j.error||"웹훅 연결 실패");
   setStatus("텔레그램 웹훅 연결 완료");
  }catch(e){setStatus(e instanceof Error?e.message:"웹훅 연결 실패")}
  finally{setBusy(false)}
 }
 return <><div className="am-heading"><h1>텔레그램 운영 알림</h1></div>
 <section style={{maxWidth:630,background:"white",padding:20,borderRadius:12,marginBottom:14}}>
 <p>BotFather에서 발급한 토큰과 웹훅 인증키를 회원·관리자 서버 환경변수에 등록한 다음 연결하세요.</p>
 <button disabled={busy} onClick={setup} style={{padding:"10px 16px",background:"#bf2032",color:"white",border:0,borderRadius:7}}>{busy?"연결 중":"봇 웹훅 연결"}</button>
 {status&&<p role="status">{status}</p>}
 </section><TelegramPairing admin/></>;
}
