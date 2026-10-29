"use client";
import {useEffect,useState} from "react";
type Level={price:number;qty:number};
type Book={symbol:string;market:string;asks:Level[];bids:Level[];totalAsk:number|null;totalBid:number|null;asOf:string};
const fmt=(v:number)=>v.toLocaleString("ko-KR");
export default function StockOrderbook({symbol}:{symbol:string}){
 const [book,setBook]=useState<Book|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;let controller:AbortController|null=null;setBook(null);setError("");setLoading(true);
 const load=async()=>{controller?.abort();controller=new AbortController();try{const response=await fetch("/api/stocks/orderbook?symbol="+encodeURIComponent(symbol),{cache:"no-store",signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||"조회 실패");if(active&&data.symbol===symbol){setBook(data);setError("")}}catch(e){if(active&&!(e instanceof Error&&e.name==="AbortError")){setError("현재 호가를 확인할 수 없습니다.");setBook(null)}}finally{if(active)setLoading(false)}};
 void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load()},15000);
 return()=>{active=false;controller?.abort();clearInterval(timer)}},[symbol]);
 const max=Math.max(1,...(book?.asks||[]).map(v=>v.qty),...(book?.bids||[]).map(v=>v.qty));
 return <section className="panel hfmOrderbook" aria-label="국내주식 호가창">
 <div className="panelHeading"><strong>호가창</strong><span className="hfmOrderbookMarket">KIS · KRX</span></div>
 <div className="hfmOrderbookBody"><div className="hfmOrderbookLabels"><span>잔량</span><span>호가</span></div>
 {loading&&!book&&<p className="hfmOrderbookStatus">호가를 조회하고 있습니다.</p>}
 {error&&<p className="hfmOrderbookStatus" role="status">{error}</p>}
 {book&&<><div className="hfmOrderbookLevels">{[...book.asks].reverse().map((v,i)=><div className="hfmOrderbookLevel ask" key={"a"+i}><div className="hfmOrderbookBar" style={{width:Math.max(0,Math.min(100,v.qty/max*100))+"%"}}/><span>{fmt(v.qty)}</span><strong>{fmt(v.price)}</strong></div>)}</div>
 <div className="hfmOrderbookSpread"><span>매도 {book.totalAsk==null?"—":fmt(book.totalAsk)}주</span><span>매수 {book.totalBid==null?"—":fmt(book.totalBid)}주</span></div>
 <div className="hfmOrderbookLevels">{book.bids.map((v,i)=><div className="hfmOrderbookLevel bid" key={"b"+i}><div className="hfmOrderbookBar" style={{width:Math.max(0,Math.min(100,v.qty/max*100))+"%"}}/><span>{fmt(v.qty)}</span><strong>{fmt(v.price)}</strong></div>)}</div>
 <p className="hfmOrderbookFoot">조회 시각 {new Date(book.asOf).toLocaleTimeString("ko-KR",{timeZone:"Asia/Seoul"})} · 15초 갱신</p></>}
 <p className="hfmOrderbookNotice">호가는 참고 시세입니다. 주문은 기존 내부 체결 기준으로 처리됩니다.</p></div></section>
}
