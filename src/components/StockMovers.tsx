"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
function StockLogo({code,name}:{code:string;name:string}){const [failed,setFailed]=useState(false);return <span style={{height:32,width:32,flex:"0 0 32px",borderRadius:"50%",background:"#f2f5fa",border:"1px solid #e2e7ef",display:"grid",placeItems:"center",overflow:"hidden",color:"#506582",fontWeight:800,fontSize:11}}>{!failed?<img src={"https://ssl.pstatic.net/imgstock/fn/real/logo/png/stock/Stock"+code+".png"} alt={name+" 심볼"} width={32} height={32} style={{objectFit:"contain"}} onError={()=>setFailed(true)}/>:<span>{name.trim().slice(0,2)}</span>}</span>;}
type Item={code:string;name:string;price:number;rate:number;tradingValue:number};
type Data={source:string;asOfTime?:string;rising:Item[];falling:Item[];active:Item[];note?:string};
const fmt=(v:number)=>v.toLocaleString("ko-KR");
export default function StockMovers(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function load(){setBusy(true);try{
 const r=await fetch("/api/market-movers",{cache:"no-store"}),j=await r.json().catch(()=>null);
 if(!r.ok||!j?.rising)throw Error(j?.detail?"순위 조회 오류: "+j.detail:"시세 순위를 불러올 수 없습니다.");
 setData(j);setError("");
 }catch(e){setError(e instanceof Error?e.message:"조회 실패");setData(null)}finally{setBusy(false)}}
 useEffect(()=>{void load();const id=setInterval(()=>void load(),120000);return()=>clearInterval(id)},[]);
 const sections:[string,keyof Pick<Data,"rising"|"falling"|"active">,string][]=[["상승률 상위","rising","#d63b53"],["하락률 상위","falling","#356de1"],["거래대금 상위","active","#647fbe"]];
 return <section className="kmHSection" style={{marginTop:20}}>
 <div className="kmHSectionTitle" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
 <div><span style={{fontSize:11,fontWeight:800,color:"#5879ba",letterSpacing:1}}>STOCK MOVERS</span><h2>국내주식 등락 랭킹</h2></div>
 </div>
 {error&&<p role="alert" style={{color:"#bf2032",padding:14}}>{error} 이전 날짜 순위는 표시하지 않습니다.</p>}
 <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(245px,1fr))",gap:12,marginTop:17}}>
 {sections.map(([title,key,color])=><div key={key} style={{border:"1px solid #e2e9f3",borderRadius:12,padding:15,background:"#fff"}}>
 <h3 style={{margin:"0 0 10px",fontSize:17,color}}>{title}</h3><div style={{height:4,background:color,borderRadius:4,opacity:.8,marginBottom:9}}/>
 {(data?.[key]||[]).slice(0,3).map((x,i)=><Link key={x.code} href="/" style={{display:"flex",alignItems:"center",gap:10,padding:"11px 0",textDecoration:"none",borderBottom:"1px solid #edf0f6",color:"#172338"}}>
 <span style={{width:18,color:"#94a3b8",fontWeight:700}}>{i+1}</span><StockLogo code={x.code} name={x.name}/>
 <div style={{flex:1,minWidth:0}}><strong style={{fontSize:13,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{x.name}</strong><span style={{fontSize:11,color:"#8491a4"}}>{x.code}</span></div>
 <div style={{textAlign:"right",fontSize:12}}><strong style={{display:"block"}}>{fmt(x.price)}원</strong><span style={{color:x.rate>=0?"#d63b53":"#356de1"}}>{x.rate>0?"+":""}{x.rate.toFixed(2)}%</span></div>
 </Link>)}
 {!data?.[key]?.length&&<p style={{fontSize:12,color:"#8290a4"}}>{busy?"조회 중":"집계된 종목 없음"}</p>}</div>)}
 </div>
 </section>
}