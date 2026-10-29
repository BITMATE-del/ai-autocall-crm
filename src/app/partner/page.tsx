"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,Users,Ticket,UserRoundPlus,TrendingUp,ShieldCheck,MessageCircle,Wallet,Building2} from "lucide-react";
type Me={username:string;role:string;permissions:string[]};
const links=[
 {name:"소속 회원 조회",description:"담당 조직의 회원 목록 및 정보",href:"/partner/members",permission:"MEMBER_LIST",icon:Users},
 {name:"영업자 관리",description:"산하 영업자 생성 및 관리",href:"/partner/agents",permission:"AGENT_CREATE",icon:UserRoundPlus},
 {name:"영업자 권한 부여",description:"보유 권한을 하위 영업자에게 즉시 부여",href:"/partner/permissions",permission:"PERMISSION_DELEGATE",icon:ShieldCheck},
 {name:"추천코드 관리",description:"가입용 추천코드 확인",href:"/partner/referrals",permission:"REFERRAL_MANAGE",icon:Ticket},
 {name:"입금 실적·배분",description:"권한 내 실적 및 정산 확인",href:"/partner/deposit-shares",permission:"PERFORMANCE_VIEW",icon:TrendingUp},

 {name:"텔레그램 알림",description:"담당 조직 알림 계정 연결",href:"/partner/telegram",permission:"",icon:MessageCircle},
];
export default function PartnerHome(){
 const [me,setMe]=useState<Me|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/partner/me",{cache:"no-store",signal:AbortSignal.timeout(8000)}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"권한 조회 실패");setMe(d)}).catch(e=>setError(String(e))).finally(()=>setLoading(false))},[]);
 return <><div className="hpPageHeading"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><div><h1>조직 운영 대시보드</h1><p>소속 조직의 회원 및 운영 현황을 관리합니다.</p></div><span className="hpPill">HFM KOREA PARTNER</span></div></div>
 {error&&<div className="hpNote" role="alert">조직 권한을 확인할 수 없습니다. {error} <Link href="/partner/login">다시 로그인</Link></div>}
 {loading&&<section className="hpCard">조직 및 권한 정보를 불러오는 중입니다.</section>}
 {me&&<><section className="hpCard" style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
 <div style={{background:"#f8e9eb",color:"#a02132",borderRadius:12,padding:15}}><Building2 size={25}/></div>
 <div style={{flex:1}}><div style={{color:"#8493a6",fontSize:12}}>현재 로그인 조직</div><h2 style={{fontSize:19,margin:"6px 0 5px"}}>{me.username}</h2><div style={{fontSize:13,color:"#64748b"}}>{me.role==="SUB_HQ"?"부본사 관리자":"영업자"} · 승인된 업무 권한에 따라 메뉴가 제공됩니다.</div></div><span className="hpPill">{me.role==="SUB_HQ"?"부본사":"영업자"}</span></section>
 <div className="hpOverview"><div className="hpCard"><span>계정 상태</span><strong style={{color:"#267753"}}>정상</strong><small>조직 접속 권한 확인 완료</small></div><div className="hpCard"><span>사용 가능한 운영 권한</span><strong>{me.permissions.length}<span>개</span></strong><small>본사 권한 설정 기준</small></div><div className="hpCard"><span>사용 가능한 업무 메뉴</span><strong>{links.filter(x=>!x.permission||me.permissions.includes(x.permission)).length}<span>개</span></strong><small>현재 계정에 허용된 기능</small></div></div>
 {me.permissions.length===0&&<div className="hpNote"><strong>본사 권한 설정이 필요합니다.</strong><div>현재 계정에 위임된 운영 권한이 0개입니다. 본사 관리자에서 이 부본사에 회원 조회·추천코드·영업자 관리 등의 권한을 부여하면 해당 기능을 이용할 수 있습니다. 화면 디자인 문제가 아니라 권한이 없는 상태입니다.</div></div>}
 <h2 className="hpSectionHeading">업무 바로가기</h2><div className="hpQuick">{links.filter(x=>!x.permission||me.permissions.includes(x.permission)).map(x=><Link href={x.href} key={x.href}><span style={{display:"flex",alignItems:"center",gap:12}}><x.icon size={20} color="#b12636"/><span>{x.name}<small style={{display:"block",color:"#8a97a8",fontWeight:400,fontSize:12,marginTop:6}}>{x.description}</small></span></span><ArrowUpRight size={17}/></Link>)}</div>
 <p style={{fontSize:12,color:"#8592a4",marginTop:23}}>조회·승인 등 실제 권한은 서버에서 별도로 검증됩니다. 담당 조직 밖의 회원 정보는 표시되지 않습니다.</p>
 </>}</>
}
