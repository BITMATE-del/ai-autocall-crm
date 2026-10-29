"use client";
import {useState} from "react";
import TelegramPairing from "@/components/TelegramPairing";
type Connection={chat_id:string;role:string;scope?:string;owner:string};
export default function Page(){
 const [status,setStatus]=useState(""),[busy,setBusy]=useState(false);
 const [connections,setConnections]=useState<Connection[]>([]),[listed,setListed]=useState(false);
 const [webhook,setWebhook]=useState<{configuredUrl:string|null;expectedUrl:string;pendingUpdates:number|null;lastErrorMessage:string|null}|null>(null);
 async function setup(){setBusy(true);setStatus("");try{
 const r=await fetch("/api/admin/telegram/setup",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
 const j=await r.json();if(!r.ok)throw Error(j.message||j.error||"웹훅 연결 실패");setStatus("웹훅 연결 완료");
 }catch(e){setStatus(e instanceof Error?e.message:"연결 실패")}finally{setBusy(false)}}
 async function checkWebhook(){try{const r=await fetch("/api/admin/telegram/setup",{cache:"no-store"});const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok)throw Error(j?.error||"연결 상태 확인 실패");setWebhook(j);setStatus(j.configuredUrl===j.expectedUrl?"웹훅 주소 정상":"웹훅 주소 확인 필요")}catch(e){setStatus(e instanceof Error?e.message:"상태 확인 실패")}}
 async function list(){try{const r=await fetch("/api/admin/telegram/manage",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error);setConnections(j.connections||[]);setListed(true)}catch(e){setStatus(String(e))}}
 async function action(kind:"test"|"delete",x:Connection){
 if(kind==="delete"&&!confirm("이 연결의 알림 수신을 해제할까요?"))return;
 try{const r=await fetch(kind==="test"?"/api/admin/telegram/test":"/api/admin/telegram/manage",{
 method:kind==="test"?"POST":"DELETE",headers:{"Content-Type":"application/json"},
 body:JSON.stringify({chat:x.chat_id,role:x.role,scope:x.scope||""})});
 const j=await r.json();if(!r.ok)throw Error(j.error||"처리 실패");
 setStatus(kind==="test"?"테스트 발송 완료":"연결 해제 완료");if(kind==="delete")await list();
 }catch(e){setStatus(String(e))}}
 return <><div className="am-heading"><h1>텔레그램 운영 알림</h1></div>
 <section style={{background:"white",padding:20,borderRadius:12,marginBottom:14,maxWidth:730}}>
  <p>Vercel 환경변수에 봇 토큰 및 웹훅 인증키를 설정한 다음 연결하세요.</p>
  <button disabled={busy} onClick={setup}>{busy?"연결 중":"봇 웹훅 연결"}</button>{" "}<button onClick={checkWebhook}>웹훅 상태 확인</button>
  {webhook&&<p>웹훅: {webhook.configuredUrl===webhook.expectedUrl?"정상":"설정 불일치"} · 대기 업데이트: {webhook.pendingUpdates??"확인 불가"}{webhook.lastErrorMessage?" · 최근 오류: "+webhook.lastErrorMessage:""}</p>}
  {status&&<p role="status">{status}</p>}
 </section>
 <TelegramPairing admin/>
 <section style={{background:"white",padding:20,borderRadius:12,marginTop:18,maxWidth:900}}>
 <h2>수신 담당자 관리</h2>
 <button onClick={list}>연결 현황 새로고침</button>
 {listed&&<div style={{overflowX:"auto",marginTop:15}}><table style={{width:"100%",borderCollapse:"collapse"}}>
 <thead><tr><th>구분</th><th>수신 범위</th><th>채팅 식별자</th><th>관리</th></tr></thead><tbody>
 {connections.map((x,i)=><tr key={x.chat_id+x.role+i}>
 <td>{x.role}</td><td>{x.scope||"전체"}</td><td>{x.chat_id.slice(0,4)}***</td>
 <td><button onClick={()=>action("test",x)}>테스트</button>{" "}<button onClick={()=>action("delete",x)}>연결 해제</button></td></tr>)}
 {!connections.length&&<tr><td colSpan={4}>연결된 담당자가 없습니다.</td></tr>}
 </tbody></table></div>}
 </section></>;
}