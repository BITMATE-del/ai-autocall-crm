"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Bell} from "lucide-react";
import ProfileShortcut from "@/components/ProfileShortcut";
import "./MemberHeader.css";
const links=[{href:"/home",label:"홈"},{href:"/",label:"국내주식"},{href:"/cfd",label:"CFD 마진거래"},{href:"/assets",label:"내 자산"},{href:"/support",label:"고객센터"}];
export default function MemberHeader(){
 const pathname=usePathname();
 return <header className="kmMemberHeader">
  <Link href="/home" className="kmMemberBrand" aria-label="K-MARKETS 홈"><span className="kmMemberMark">K</span><strong>K-MARKETS</strong></Link>
  <nav className="kmMemberNav" aria-label="회원 주요 메뉴">{links.map(x=><Link key={x.href} href={x.href} className={pathname===x.href||(x.href!=="/"&&pathname.startsWith(x.href+"/"))?"kmMemberSelected":""} aria-current={pathname===x.href?"page":undefined}>{x.label}</Link>)}</nav>
  <div className="kmMemberActions"><Link href="/assets" className="kmMemberNotification" aria-label="내 자산 및 알림"><Bell size={17}/></Link><ProfileShortcut className="kmMemberProfile" style={{textDecoration:"none"}}>KM</ProfileShortcut></div>
 </header>;
}
