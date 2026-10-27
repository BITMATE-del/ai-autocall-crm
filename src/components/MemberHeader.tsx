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
 const [notes,setNotes]=useState<{id:string;title:string;body:string;createdAt:string}[]>([]);
 useEffect(()=>{let alive=true;const load=async()=>{try{const response=await fetch("/api/stock-event-messages",{cache:"no-store"});if(!response.ok)return;const result=await response.json();if(alive)setNotes(result.messages||[])}catch{}};void load();const id=setInterval(()=>void load(),30000);return()=>{alive=false;clearInterval(id)}},[]);
 return <header className="kmMemberHeader">
  <Link href="/home" className="kmMemberBrand" aria-label="HFM KOREA 홈"><img src="/assets/brand/hfm-partner-lockup.svg" alt="HFM KOREA Official Broker Partner" className="kmMemberLogo"/></Link>
  <nav className="kmMemberNav" aria-label="회원 주요 메뉴">{links.map(x=><Link key={x.href} href={x.href} className={pathname===x.href||(x.href!=="/"&&pathname.startsWith(x.href+"/"))?"kmMemberSelected":""} aria-current={pathname===x.href?"page":undefined}>{x.label}</Link>)}</nav>
  <div className="kmMemberActions"><div className="kmMemberNotifyWrap"><button type="button" className="kmMemberNotification" aria-label="알림 보기" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><Bell size={17}/>{notes.length>0&&<span className="kmMemberNotifyDot"/>}</button>{open&&<div className="kmMemberNotifyPanel"><div className="kmMemberNotifyTitle">알림 <button type="button" onClick={()=>setOpen(false)}>닫기</button></div>{notes.length?notes.slice(0,20).map(n=><div className="kmMemberNotifyItem" key={n.id}><strong>{n.title}</strong><p>{n.body}</p><small>{new Date(n.createdAt).toLocaleString("ko-KR")}</small></div>):<p className="kmMemberNotifyEmpty">새로운 알림이 없습니다.</p>}</div>}</div><ProfileShortcut className="kmMemberProfile" style={{textDecoration:"none"}}>KM</ProfileShortcut></div>
 </header>;
}
