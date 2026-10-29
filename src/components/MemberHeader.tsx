"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Bell} from "lucide-react";
import {useEffect,useState} from "react";
import ProfileShortcut from "@/components/ProfileShortcut";
import "./MemberHeader.css";
const links=[{href:"/home",label:"홈"},{href:"/",label:"국내주식"},{href:"/cfd",label:"CFD 마진거래"},{href:"/assets",label:"내 자산"},{href:"/support",label:"고객센터"}];
export default function MemberHeader(){
 const pathname=usePathname();
 const [open,setOpen]=useState(false);
 const [supportReply,setSupportReply]=useState<string|null>(null);
 const [dismissed,setDismissed]=useState<string[]>([]);
 const [notes,setNotes]=useState<{id:string;title:string;body:string;createdAt:string;isRead:boolean}[]>([]);
 useEffect(()=>{let alive=true;const load=async()=>{try{const response=await fetch("/api/stock-event-messages",{cache:"no-store"});if(!response.ok)return;const result=await response.json();if(alive)setNotes(result.messages||[])}catch{}};void load();const id=setInterval(()=>void load(),30000);return()=>{alive=false;clearInterval(id)}},[]);
 useEffect(()=>{let live=true;const poll=async()=>{if(document.visibilityState!=="visible")return;try{const r=await fetch("/api/support",{cache:"no-store"});if(!r.ok)return;const j=await r.json();const unread=(j.tickets||[]).find((t:{id:string;reply:string|null;read_at:string|null})=>Boolean(t.reply)&&!t.read_at&&!dismissed.includes(t.id));if(live)setSupportReply(v=>v||unread?.id||null)}catch{}};void poll();const timer=setInterval(()=>void poll(),15000);return()=>{live=false;clearInterval(timer)}},[dismissed]);
 async function markNotificationRead(id:string){try{const r=await fetch("/api/stock-event-messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});if(!r.ok)throw Error("READ_FAILED");setNotes(v=>v.map(n=>n.id===id?{...n,isRead:true}:n))}catch{}}
 async function dismissReply(){const id=supportReply;if(!id)return;setSupportReply(null);setDismissed(v=>[...v,id]);try{await fetch("/api/support",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"READ",id})})}catch{}}
 return <><header className="kmMemberHeader">
  <Link href="/home" className="kmMemberBrand" aria-label="HFM KOREA 홈"><img src="/assets/brand/hfm-korea-original-logo.png" alt="HFM KOREA Official Broker Partner" className="kmMemberLogo"/></Link>
  <nav className="kmMemberNav" aria-label="회원 주요 메뉴">{links.map(x=><Link key={x.href} href={x.href} className={pathname===x.href||(x.href!=="/"&&pathname.startsWith(x.href+"/"))?"kmMemberSelected":""} aria-current={pathname===x.href?"page":undefined}>{x.label}</Link>)}</nav>
  <div className="kmMemberActions"><div className="kmMemberNotifyWrap"><button type="button" className="kmMemberNotification" aria-label="알림 보기" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Bell size={17}/>{notes.some(n=>!n.isRead)&&<span className="kmMemberNotifyDot"/>}</button>{open&&<div className="kmMemberNotifyPanel"><div className="kmMemberNotifyTitle">알림 <button type="button" onClick={()=>setOpen(false)}>닫기</button></div>{notes.length?notes.slice(0,20).map(n=><div className="kmMemberNotifyItem" key={n.id} style={{opacity:n.isRead?0.72:1}}><strong>{n.title}</strong><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleString("ko-KR")}</small>{!n.isRead&&<button type="button" onClick={()=>void markNotificationRead(n.id)} style={{display:"block",marginTop:7,padding:"5px 9px",border:"1px solid #dbe5f2",borderRadius:6,background:"#fff",color:"#3468ba",fontSize:11}}>확인</button>}</div>):<p className="kmMemberNotifyEmpty">새로운 알림이 없습니다.</p>}</div>}</div><ProfileShortcut className="kmMemberProfile" style={{textDecoration:"none"}}>KM</ProfileShortcut></div>
 </header>{supportReply&&<div className="kmSupportReplyBackdrop" role="presentation"><div className="kmSupportReplyModal" role="alertdialog" aria-modal="true" aria-label="고객센터 답변 알림"><div className="kmSupportReplyIcon">✓</div><h2>고객센터 답변 도착</h2><p>문의하신 내용에 답변이 도착했습니다.</p><div><button type="button" onClick={dismissReply}>확인</button><Link href="/support" onClick={()=>void dismissReply()}>답변 확인하기</Link></div></div></div>}</>;

}
