import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
const number=(v:unknown)=>Number(String(v??"").replace(/,/g,""));
export async function GET(req:Request){
 const url=new URL(req.url),symbol=String(url.searchParams.get("symbol")||"");
 if(!/^\d{6}$/.test(symbol))return NextResponse.json({error:"INVALID_SYMBOL"},{status:400});
 const period=String(url.searchParams.get("period")||"day");
 const periodType=period==="week"?"weekCandle":period==="month"?"monthCandle":"dayCandle";
 try{
 const [quoteRes,chartRes]=await Promise.all([
 fetch("https://polling.finance.naver.com/api/realtime/domestic/stock/"+symbol,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{Accept:"application/json"}}),
 fetch("https://api.stock.naver.com/chart/domestic/item/"+symbol+"?periodType="+periodType,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{Accept:"application/json"}})
 ]);
 if(!quoteRes.ok||!chartRes.ok)throw Error("NAVER_UPSTREAM_UNAVAILABLE");
 const q=await quoteRes.json(),c=await chartRes.json();
 const item=q?.datas?.find((d:{itemCode?:string})=>d.itemCode===symbol);
 const rows=Array.isArray(c)?c:Array.isArray(c?.priceInfos)?c.priceInfos:Array.isArray(c?.priceInfo)?c.priceInfo:Array.isArray(c?.result?.priceInfos)?c.result.priceInfos:[];
 if(!item||rows.length===0)throw Error("NAVER_DATA_UNAVAILABLE");
 const candles=rows.map((r:any)=>({time:String(r.localDate||"").slice(0,4)+"-"+String(r.localDate||"").slice(4,6)+"-"+String(r.localDate||"").slice(6,8),open:number(r.openPrice),high:number(r.highPrice),low:number(r.lowPrice),close:number(r.closePrice),volume:number(r.accumulatedTradingVolume)})).filter((r:any)=>/^\d{4}-\d{2}-\d{2}$/.test(r.time)&&r.close>0&&r.open>0&&r.high>=Math.max(r.open,r.close)&&r.low<=Math.min(r.open,r.close)).sort((a:any,b:any)=>a.time.localeCompare(b.time)).slice(-250);
 if(!candles.length)throw Error("NAVER_CHART_UNAVAILABLE");
 return NextResponse.json({source:"NAVER_UNOFFICIAL_PREVIEW",tradeable:false,symbol,name:item.stockName||symbol,price:number(item.closePrice),change:number(item.compareToPreviousClosePrice),rate:Number(item.fluctuationsRatio),marketStatus:item.marketStatus||"UNKNOWN",asOf:item.localTradedAt||null,candles},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"NAVER_PREVIEW_UNAVAILABLE",tradeable:false},{status:503})}
}
