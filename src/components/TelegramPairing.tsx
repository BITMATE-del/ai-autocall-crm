"use client";
import {useEffect,useState} from "react";
type Code={id:string;code:string};
export default function TelegramPairing({admin=false}:{admin?:boolean}){
 const [codes,setCodes]=useState<Code[]>([]),[code,setCode]=useState("");
 const [command,setCommand]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{if(admin)return;fetch("/api/partner/telegram",{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error("추천코드 조회 실패");return r.json()}).then(d=>{setCodes(d.codes||[]);setCode(d.codes?.[0]?.code||"")}).catch(e=>setError(String(e)))},[admin]);
 async function issue(){setBusy(true);setError("");setCommand("");try{
 const url=admin?"/api/admin/telegram":"/api/partner/telegram";
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(admin?{}:{code})});
 const d=await r.json();if(!r.ok)throw Error(d.error||"연결코드 발급 실패");
 setCommand(d.pairCommand);
 }catch(e){setError(e instanceof Error?e.message:"처리 실패")}finally{setBusy(false)}}
 return <section style={{background:"white",border:"1px solid #e5e7eb",borderRadius:12,padding:24,maxWidth:630}}>
 <h2 style={{marginTop:0}}>텔레그램 알림 연결</h2>
 <p style={{lineHeight:1.7,color:"#555"}}>{admin?"본사 관리자에게는 전체 회원의 문의·입금·출금 신청 알림이 전송됩니다.":"본인에게 발급된 추천코드로 가입한 회원의 문의·입금·출금 신청만 받습니다."}</p>
 {!admin&&<label>담당 추천코드 <select value={code} onChange={e=>setCode(e.target.value)} style={{marginLeft:12,padding:9}}>{codes.map(x=><option key={x.id} value={x.code}>{x.code}</option>)}</select></label>}
 <div style={{marginTop:20}}><button onClick={issue} disabled={busy||(!admin&&!code)} style={{background:"#bf2032",border:0,borderRadius:7,padding:"12px 16px",color:"white",cursor:"pointer"}}>{busy?"발급 중":"일회용 봇 연결코드 발급"}</button></div>
 {command&&<div style={{marginTop:20,background:"#f5f5f6",padding:14,borderRadius:8}}><p>텔레그램 HFM KOREA 알림봇의 개인 대화창에 아래 명령어를 보내세요. 10분 후 만료됩니다.</p><code style={{overflowWrap:"anywhere"}}>{command}</code><div style={{marginTop:12}}><button onClick={()=>navigator.clipboard.writeText(command)}>명령어 복사</button></div></div>}
 {error&&<p role="alert" style={{color:"#bb2032"}}>{error}</p>}
 <p style={{fontSize:12,color:"#666",marginTop:20}}>단순 추천코드 입력만으로는 연결할 수 없습니다. 타인의 회원 알림을 보호하기 위해 계정 인증 후 발급한 일회용 연결코드를 사용합니다.</p>
 </section>
}
