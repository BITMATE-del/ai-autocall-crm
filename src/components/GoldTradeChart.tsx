"use client";
import {useEffect,useRef,useState} from "react";
import {createChart,ColorType,LineSeries} from "lightweight-charts";
type Bar={time:number;value:number};
export default function GoldTradeChart(){
 const target=useRef<HTMLDivElement>(null);
 const [bars,setBars]=useState<Bar[]>([]);
 const [error,setError]=useState("");
 useEffect(()=>{let dead=false;const read=async()=>{try{const r=await fetch("/api/commodities/chart?symbol=XAUUSD",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"FEED_UNAVAILABLE");if(!dead){setBars(Array.isArray(j.bars)?j.bars:[]);setError("")}}catch(e){if(!dead){setBars([]);setError("거래 기준 시세 차트를 불러올 수 없습니다.")}}};void read();const tick=setInterval(read,15000);return()=>{dead=true;clearInterval(tick)}},[]);
 useEffect(()=>{const el=target.current;if(!el||!bars.length)return;const chart=createChart(el,{width:el.clientWidth,height:380,layout:{background:{type:ColorType.Solid,color:"#fff"},textColor:"#7e8da6"},grid:{vertLines:{color:"#eff2f8"},horzLines:{color:"#eff2f8"}},timeScale:{timeVisible:true,secondsVisible:false},rightPriceScale:{borderVisible:false}});const line=chart.addSeries(LineSeries,{color:"#4263e2",lineWidth:2,priceLineVisible:true});line.setData(bars.map(b=>({time:b.time as any,value:b.value})));chart.timeScale().fitContent();const observer=new ResizeObserver(()=>{if(el.clientWidth)chart.applyOptions({width:el.clientWidth})});observer.observe(el);return()=>{observer.disconnect();chart.remove()}},[bars]);
 return <div aria-label="GOLD 거래 기준 시세 차트" style={{height:400,width:"100%"}}>{error?<div className="empty">{error}</div>:<><div ref={target} style={{width:"100%",height:380}}/>{!bars.length&&<div className="empty">GOLD 거래 기준 시세를 확인하고 있습니다.</div>}</>}</div>;
}
