"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {LayoutDashboard,Users,UserRoundPlus,Ticket,MessageCircle,Wallet,ShieldCheck,LogOut,Menu,X,Landmark,TrendingUp} from "lucide-react";
import "./partner-shell.css";
type Me={username:string;role:string;permissions:string[]};
const entries=[
 {name:"대시보드",href:"/partner",permission:"",icon:LayoutDashboard},
 {name:"소속 회원",href:"/partner/members",permission:"MEMBER_LIST",icon:Users},
 {name:"고객센터 답변",href:"/partner/support",permission:"MEMBER_LIST",icon:MessageCircle},
 {name:"입출금 요청·안내",href:"/partner/funding",permission:"FUNDING_HISTORY",icon:Wallet},
 {name:"입금주소 관리",href:"/partner/deposit-addresses",permission:"FUNDING_HISTORY",icon:Wallet},
 {name:"영업자 관리",href:"/partner/agents",permission:"AGENT_CREATE",icon:UserRoundPlus},
 {name:"하부 권한 부여",href:"/partner/permissions",permission:"PERMISSION_DELEGATE",icon:ShieldCheck},
 {name:"추천코드",href:"/partner/referrals",permission:"REFERRAL_MANAGE",icon:Ticket},
 {name:"입금 실적·배분",href:"/partner/deposit-shares",permission:"PERFORMANCE_VIEW",icon:TrendingUp},

 {name:"매수금액 보정",href:"/partner/purchase-corrections",permission:"PURCHASE_CORRECTION",icon:TrendingUp},
 {name:"주식 이벤트 지급",href:"/partner/stock-events",permission:"STOCK_EVENT_GRANT",icon:Ticket},
 {name:"CFD 판정보정",href:"/partner/cfd-corrections",permission:"CFD_CORRECTION",icon:ShieldCheck},
 {name:"텔레그램 알림",href:"/partner/telegram",permission:"",icon:MessageCircle},
];
export default function PartnerShell({children}:{children:React.ReactNode}){
 const pathname=usePathname(),login=pathname==="/partner/login";
 const [me,setMe]=useState<Me|null>(null),[open,setOpen]=useState(false);
 useEffect(()=>{if(login)return;fetch("/api/partner/me",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(j=>setMe(j)).catch(()=>{})},[login]);
 if(login)return <>{children}</>;
 const visible=entries.filter(x=>!x.permission||me?.permissions.includes(x.permission)||["PURCHASE_CORRECTION","STOCK_EVENT_GRANT","CFD_CORRECTION"].includes(x.permission));
 return <div className="hpShell"><aside className={"hpSidebar "+(open?"hpOpen":"")}>
 <div className="hpBrand"><span className="hpBrandMark">H</span><div><strong>HFM KOREA</strong><small>PARTNER OFFICE</small></div><button className="hpClose" onClick={()=>setOpen(false)} aria-label="메뉴 닫기"><X size={20}/></button></div>
 <div className="hpLabel">조직 운영</div><nav className="hpNav">{visible.map(e=><Link key={e.href} href={e.href} onClick={()=>setOpen(false)} className={pathname===e.href?"hpActive":""}><e.icon size={18}/>{e.name}{["PURCHASE_CORRECTION","STOCK_EVENT_GRANT","CFD_CORRECTION"].includes(e.permission)&&!me?.permissions.includes(e.permission)&&<small style={{marginLeft:"auto",fontSize:10,opacity:.8}}>권한 필요</small>}</Link>)}</nav>
 <div className="hpSideFoot"><Landmark size={16}/> 본사 권한에 따라 메뉴가 표시됩니다.</div></aside>
 {open&&<button className="hpBackdrop" onClick={()=>setOpen(false)} aria-label="메뉴 닫기"/>}
 <div className="hpContent"><header className="hpTopbar"><button className="hpMenu" onClick={()=>setOpen(true)} aria-label="메뉴 열기"><Menu size={21}/></button><div className="hpTopTitle">조직 운영 관리 <span> / {entries.find(x=>x.href===pathname)?.name||"관리"}</span></div><div className="hpAccount"><span className="hpAccountAvatar">{(me?.username||"H").slice(0,1).toUpperCase()}</span><div><strong>{me?.username||"담당자"}</strong><small>{me?.role==="SUB_HQ"?"부본사":me?.role==="AGENT"?"영업자":"조직 관리자"}</small></div></div><button title="로그아웃" className="hpLogout" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});location.assign("/partner/login")}}><LogOut size={17}/></button></header>
 <main className="hpMain">{children}</main></div></div>
}
