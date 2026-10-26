"use client";
import {useEffect,useState} from "react";
type Bar={time:number;value:number};
export default function GoldTradeChart(){
 const [bars,setBars]=useState<Bar[]>([]);
 const [error,setError]=useState("");
 useEffect(()=>{let dead=false;const read=async()=>{try{const r=await fetch("/api/commodities/chart?symbol=XAUUSD",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"FEED_UNAVAILABLE");if(!dead){setBars(Array.isArray(j.bars)?j.bars:[]);setError("")}}catch{if(!dead){setBars([]);setError("GOLD 거래 기준 시세를 확인할 수 없습니다.")}}};void read();const tick=setInterval(read,15000);return()=>{dead=true;clearInterval(tick)}},[]);
 const values=bars.map(b=>b.value);
 const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):0;
 const span=Math.max(max-min,0.01),denom=Math.max(bars.length-1,1);
 const points=bars.map((b,i)=>String(16+748*i/denom)+","+String(342-320*(b.value-min)/span)).join(" ");
 return <div aria-label="GOLD 거래 기준 시세 차트" style={{width:"100%",minHeight:385,position:"relative"}}>{bars.length?<svg viewBox="0 0 780 380" preserveAspectRatio="none" role="img" aria-label="GOLD 동일 기준 1분봉 시세 변화" style={{width:"100%",height:380,display:"block",background:"#fff"}}><g stroke="#edf1f7" strokeWidth="1">{[60,120,180,240,300,360].map(y=><line key={y} x1="0" x2="780" y1={y} y2={y}/>)}</g><polyline points={points} fill="none" stroke="#4263e2" strokeWidth="2.3" vectorEffect="non-scaling-stroke"/></svg>:<div className="empty">{error||"GOLD 거래 기준 시세를 확인하고 있습니다."}</div>}</div>;
}
