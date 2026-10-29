"use client";
import {useEffect,useState} from "react";
type Level={price:number;qty:number};
type Book={symbol:string;market:string;asks:Level[];bids:Level[];totalAsk:number|null;totalBid:number|null;asOf:string};
const fmt=(v:number)=>v.toLocaleString("ko-KR");
export default function StockOrderbook({symbol}:{symbol:string}){
 const [book,setBook]=useState<Book|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;let controller:AbortController|null=null;let socket:WebSocket|null=null;let liveAt=0;let retry:ReturnType<typeof setTimeout>|null=null;let poll:ReturnType<typeof setTimeout>|null=null;setBook(null);setError("");setLoading(true);
 const load=async()=>{if(!active||document.visibilityState!=="visible")return;controller?.abort();controller=new AbortController();try{const response=await fetch("/api/stocks/orderbook?symbol="+encodeURIComponent(symbol),{cache:"no-store",signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||"조회 실패");if(active&&data.symbol===symbol&&Date.now()-liveAt>3000){setBook(data);setError("")}}catch(e){if(active&&!(e instanceof Error&&e.name==="AbortError")&&Date.now()-liveAt>8000){setError("현재 호가를 확인할 수 없습니다.");setBook(null)}}finally{if(active)setLoading(false)}};
 const connect=()=>{if(!active||document.visibilityState!=="visible")return;try{socket=new WebSocket(location.origin.replace(/^http/,"ws")+"/api/stocks/orderbook/live?symbol="+encodeURIComponent(symbol));socket.onmessage=(event)=>{try{const v=JSON.parse(event.data);if(v.symbol===symbol&&v.asks?.length&&v.bids?.length){liveAt=Date.now();setBook(v);setLoading(false);setError("")}}catch{}};socket.onclose=()=>{if(active)retry=setTimeout(connect,10000)};socket.onerror=()=>{socket?.close()}}catch{retry=setTimeout(connect,10000)}};
 const visible=()=>{if(document.visibilityState==="visible"&&(!socket||socket.readyState===WebSocket.CLOSED))connect();else if(document.visibilityState!=="visible"){socket?.close();socket=null}};
 void load();connect();
 const schedule=()=>{if(!active)return;if(Date.now()-liveAt>3500)void load();poll=setTimeout(schedule,5000)};poll=setTimeout(schedule,5000);
 document.addEventListener("visibilitychange",visible);
 return()=>{active=false;controller?.abort();socket?.close();if(retry)clearTimeout(retry);if(poll)clearTimeout(poll);document.removeEventListener("visibilitychange",visible)}},[symbol]);
 const max=Math.max(1,...(book?.asks||[]).map(v=>v.qty),...(book?.bids||[]).map(v=>v.qty));
 return <section className={"panel hfmOrderbook "+(!book?"hfmOrderbookEmpty":"")} aria-label="국내주식 호가창">
 <div className="panelHeading"><strong>호가창</strong><span className="hfmOrderbookMarket">KIS · KRX</span></div>
 <div className="hfmOrderbookBody"><div className="hfmOrderbookLabels"><span>잔량</span><span>호가</span></div>
 {loading&&!book&&<p className="hfmOrderbookStatus">호가를 조회하고 있습니다.</p>}
 {error&&<p className="hfmOrderbookStatus" role="status">{error}</p>}
 {book&&<><div className="hfmOrderbookLevels">{[...book.asks].reverse().map((v,i)=><div className="hfmOrderbookLevel ask" key={"a"+i}><div className="hfmOrderbookBar" style={{width:Math.max(0,Math.min(100,v.qty/max*100))+"%"}}/><span>{fmt(v.qty)}</span><strong>{fmt(v.price)}</strong></div>)}</div>
 <div className="hfmOrderbookSpread"><span>매도 {book.totalAsk==null?"—":fmt(book.totalAsk)}주</span><span>매수 {book.totalBid==null?"—":fmt(book.totalBid)}주</span></div>
 <div className="hfmOrderbookLevels">{book.bids.map((v,i)=><div className="hfmOrderbookLevel bid" key={"b"+i}><div className="hfmOrderbookBar" style={{width:Math.max(0,Math.min(100,v.qty/max*100))+"%"}}/><span>{fmt(v.qty)}</span><strong>{fmt(v.price)}</strong></div>)}</div>
 </>}
 </div></section>
}
