"use client";
import {useEffect,useState} from "react";
type Org={id:string;name:string;type:string;parent_id?:string};
type Grant={key:string;direct:boolean;effective:boolean;canDelegate:boolean;reason:string};
const labels:Record<string,string>={
 MEMBER_LIST:"회원 목록 조회",MEMBER_DETAIL:"회원 상세정보",TRADE_HISTORY:"회원 거래내역",FUNDING_HISTORY:"입출금 이력",MEMBER_BALANCE:"회원 잔액 조회",
 MEMBER_FREEZE:"회원 이용정지",MEMBER_UNFREEZE:"회원 정지해제",MEMBER_MEMO:"상담 메모",AGENT_CREATE:"영업자 생성",
 AGENT_EDIT:"영업자 정보수정",AGENT_SUSPEND:"영업자 정지",REFERRAL_ISSUE:"추천코드 발급",REFERRAL_MANAGE:"추천코드 관리",
 PERFORMANCE_VIEW:"실적 조회",SETTLEMENT_VIEW:"정산 조회",PERMISSION_DELEGATE:"권한 위임 관리",ORG_LOG_VIEW:"조직 로그",
 COMMISSION_VIEW:"수익 배분 조회",COMMISSION_POLICY_EDIT:"배분율 설정",WITHDRAW_HOLD_REQUEST:"출금 검토 요청",MEMBER_ACTIVITY_VIEW:"회원 활동 조회"
};
export default function PartnerPermissions(){
 const [orgs,setOrgs]=useState<Org[]>([]),[id,setId]=useState(""),[grants,setGrants]=useState<Grant[]>([]);
 const [own,setOwn]=useState<Grant[]>([]),[reason,setReason]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 async function list(){try{const r=await fetch("/api/admin/organizations",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error);setOrgs((j.organizations||[]).filter((o:Org)=>o.type==="AGENT"))}catch(e){setError(String(e))}}
 async function inspect(org:string){setId(org);setError("");if(!org)return;try{const r=await fetch("/api/admin/organization-permissions?organizationId="+encodeURIComponent(org),{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error);setGrants(j.permissions||[])}catch(e){setError(String(e))}}
 async function inspectOwn(){try{const r=await fetch("/api/admin/organization-permissions",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error);setOwn(j.permissions||[])}catch(e){setError(String(e))}}
 useEffect(()=>{void list();void inspectOwn()},[]);
 async function update(g:Grant,active:boolean){if(reason.trim().length<5){setError("변경 사유를 5자 이상 입력해 주세요.");return}
 if(!confirm((active?"권한을 즉시 부여":"권한을 즉시 회수")+"하시겠습니까? 별도의 본사 승인 없이 바로 적용됩니다."))return;
 setBusy(true);setError("");setNotice("");
 try{const r=await fetch("/api/admin/organization-permissions",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({organizationId:id,permission:g.key,active,canDelegate:false,reason:reason.trim()})});const j=await r.json();if(!r.ok)throw Error(j.error||"변경 실패");setNotice("권한 변경을 즉시 적용했습니다.");await inspect(id)}
 catch(e){setError(e instanceof Error?e.message:"권한 변경 실패")}finally{setBusy(false)}}
 return <><div className="hpPageHeading"><h1>하부 영업자 권한 관리</h1><p>부본사에 허용된 권한만 영업자별로 부여·회수할 수 있습니다. 변경 즉시 적용되며 본사 재승인은 필요하지 않습니다.</p></div>
 {error&&<div role="alert" className="hpNote">{error}</div>}{notice&&<p role="status" style={{color:"#28744d"}}>{notice}</p>}
 <section className="hpCard" style={{marginBottom:16}}>
 <strong>영업자 선택</strong><select value={id} onChange={e=>void inspect(e.target.value)} style={{display:"block",width:"100%",maxWidth:490,marginTop:12,padding:12,border:"1px solid #d7dfe9",borderRadius:7}}>
 <option value="">영업자를 선택하세요</option>{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
 <p style={{fontSize:12,color:"#64748b"}}>직접 부여 전에 본사에서 부본사 권한과 하위 위임 허용을 설정해야 합니다.</p>
 <input aria-label="권한 변경 사유" placeholder="변경 사유 (5자 이상)" value={reason} onChange={e=>setReason(e.target.value)} style={{padding:12,border:"1px solid #d7dfe9",borderRadius:7,width:"100%",maxWidth:490}}/>
 </section>
 {id&&<section className="hpCard" style={{overflowX:"auto"}}><h2 style={{fontSize:18,marginTop:0}}>영업자 권한 설정</h2><table style={{width:"100%",borderCollapse:"collapse",minWidth:560}}><thead><tr><th style={{textAlign:"left",padding:12}}>기능</th><th>부본사 위임 가능</th><th>영업자 이용 상태</th><th>부여·회수</th></tr></thead><tbody>
 {grants.map(g=>{const parent=own.find(x=>x.key===g.key);const allowed=!!parent?.canDelegate;return <tr key={g.key} style={{borderTop:"1px solid #e5eaf0"}}>
 <td style={{padding:12}}>{labels[g.key]||g.key}</td><td style={{textAlign:"center"}}>{allowed?"가능":"불가"}</td>
 <td style={{textAlign:"center",color:g.effective?"#24794a":"#8a95a7"}}>{g.effective?"사용 가능":"사용 불가"}</td>
 <td style={{textAlign:"center"}}><input type="checkbox" aria-label={(labels[g.key]||g.key)+" 권한 부여"} checked={g.direct} disabled={busy||(!allowed&&!g.direct)} onChange={e=>void update(g,e.target.checked)}/></td>
 </tr>})}</tbody></table></section>}</>
}
