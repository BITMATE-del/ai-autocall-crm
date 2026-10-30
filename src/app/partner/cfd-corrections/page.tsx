"use client";
import {useEffect,useState} from "react";
type Order={id:string;user_id:string;username:string;symbol:string;direction:string;amount_krw:string;entry_price:string;exit_price:string|null;result:string|null;status:string;created_at:string;expires_at:string;correction:{id:string;status:string;requested_result:string}|null};
type Preview={newResult:string;oldPayoutKrw:number;newPayoutKrw:number;deltaKrw:number;source:string};
const fmt=(v:string|number|null)=>v==null?"—":Number(v).toLocaleString("ko-KR");
const inp={padding:"10px 12px",border:"1px solid #dce3ec",borderRadius:8,background:"#fff",color:"#172338"};
export default function PartnerCorrections(){
 const defaultReason="담당자 직접 판정보정";
 const[orders,setOrders]=useState<Order[]>([]),[selected,setSelected]=useState<Order|null>(null),[query,setQuery]=useState(""),[mode,setMode]=useState("AUTO"),[reason,setReason]=useState(defaultReason),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[preview,setPreview]=useState<Preview|null>(null);
 async function load(){setBusy(true);try{const r=await fetch("/api/partner/cfd-corrections?q="+encodeURIComponent(query),{cache:"no-store",signal:AbortSignal.timeout(12000)});const j=await r.json();if(!r.ok)throw Error(j.error||"조회 실패");setOrders(j.orders||[])}catch(e){setMessage(e instanceof Error?e.message:"거래 조회 실패")}finally{setBusy(false)}}
 useEffect(()=>{void load()},[]);
 function open(o:Order){setSelected(o);setMode("AUTO");setReason(defaultReason);setPreview(null);setMessage("")}
 async function apply(dryRun:boolean){if(!selected||busy)return;
 if(!dryRun&&!confirm("선택한 거래에 판정보정을 저장하시겠습니까? 거래 정산과 회원 잔액에 반영됩니다."))return;
 setBusy(true);setMessage("");
 try{const active=selected.status==="ACTIVE",r=await fetch(active?"/api/admin/cfd-corrections/active":"/api/admin/cfd-corrections/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:selected.id,result:mode,reason,dryRun:active?undefined:dryRun}),signal:AbortSignal.timeout(20000)});
 const j=await r.json();if(!r.ok)throw Error(j.error||"판정보정 실패");
 if(!active&&dryRun){setPreview(j);setMessage("정산 차액을 확인한 뒤 저장하세요.");return}
 setSelected(null);setPreview(null);setMessage(active?"진행 중 거래 판정보정 예약 완료":"판정보정 저장 완료");await load();
 }catch(e){setMessage(e instanceof Error?e.message:"처리 실패")}finally{setBusy(false)}}
 return <main style={{background:"#f4f6f9",color:"#172338",padding:"clamp(15px,3vw,28px)",borderRadius:12,minHeight:"70vh"}}>
 <h1 style={{fontSize:24,fontWeight:800}}>CFD 판정보정</h1>
 <p style={{fontSize:13,color:"#64748b",margin:"8px 0 20px"}}>내 담당 코드에 귀속된 회원의 거래만 조회하고 보정할 수 있습니다.</p>
 <form onSubmit={e=>{e.preventDefault();void load()}} style={{display:"flex",gap:8,marginBottom:16}}>
 <input aria-label="거래 검색" placeholder="회원명 · 거래 ID · 종목" value={query} onChange={e=>setQuery(e.target.value)} style={{...inp,flex:1,minWidth:0}}/>
 <button disabled={busy} style={{padding:"10px 18px",borderRadius:8,background:"#3468ba",color:"#fff",fontWeight:700}}>검색</button></form>
 {message&&<p role="status" style={{margin:"10px 0",color:"#28599b"}}>{message}</p>}
 <div style={{overflowX:"auto",background:"#fff",borderRadius:10,border:"1px solid #dce3ec"}}>
 <table style={{width:"100%",minWidth:750,borderCollapse:"collapse",fontSize:13}}><thead><tr>{["회원","거래 ID","종목 · 방향","금액","거래 상태","판정","관리"].map(k=><th key={k} style={{textAlign:"left",padding:13,borderBottom:"1px solid #dce3ec"}}>{k}</th>)}</tr></thead>
 <tbody>{orders.map(o=><tr key={o.id} style={{borderBottom:"1px solid #edf1f6"}}><td style={{padding:12}}>{o.username}</td><td style={{padding:12}}>{o.id.slice(0,8)}</td><td style={{padding:12}}>{o.symbol} · {o.direction}</td><td style={{padding:12}}>{fmt(o.amount_krw)}원</td><td style={{padding:12}}>{o.status}</td><td style={{padding:12}}>{o.result||"대기"}</td><td style={{padding:12}}><button type="button" onClick={()=>open(o)} style={{...inp,cursor:"pointer"}}>판정보정</button></td></tr>)}</tbody></table>
 {orders.length===0&&!busy&&<p style={{padding:20,color:"#64748b"}}>조회된 거래가 없습니다.</p>}</div>
 {selected&&<section style={{marginTop:18,padding:20,maxWidth:750,background:"#fff",border:"1px solid #dce3ec",borderRadius:10}}>
 <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 style={{fontSize:18,fontWeight:800}}>판정보정 · {selected.username}</h2><button type="button" onClick={()=>setSelected(null)}>닫기 ✕</button></div>
 <p style={{fontSize:13,color:"#64748b",lineHeight:1.8,margin:"12px 0"}}>{selected.symbol} · {selected.direction} · {fmt(selected.amount_krw)}원<br/>거래 ID: {selected.id}<br/>현재 판정: {selected.result||selected.status}</p>
 <div style={{display:"grid",gap:12}}><label>판정<select value={mode} onChange={e=>{setMode(e.target.value);setPreview(null)}} style={{...inp,display:"block",width:"100%",marginTop:6}}>{["AUTO","WIN","LOSS","VOID"].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>정정 사유<textarea value={reason} onChange={e=>{setReason(e.target.value);setPreview(null)}} rows={2} maxLength={2000} placeholder="정정 내용을 입력하세요" style={{...inp,width:"100%",marginTop:6}}/></label>
 {preview&&<div style={{background:"#f2f6fc",padding:13,borderRadius:9,fontSize:13}}>확인된 판정: <strong>{preview.newResult}</strong><div>정산 차액: <strong>{fmt(preview.deltaKrw)}원</strong></div></div>}
 {selected.status==="ACTIVE"?<button type="button" disabled={busy||reason.trim().length<5} onClick={()=>void apply(false)} style={{padding:12,borderRadius:8,background:"#3468ba",color:"#fff",fontWeight:750}}>보정 예약 저장</button>:selected.status==="SETTLED"?<button type="button" disabled={busy||reason.trim().length<10} onClick={()=>void apply(!preview)} style={{padding:12,borderRadius:8,background:"#3468ba",color:"#fff",fontWeight:750}}>{preview?"판정보정 저장":"정산 차액 확인"}</button>:<p>진행 중 또는 종료된 거래만 보정할 수 있습니다.</p>}
 </div></section>}
 </main>
}
