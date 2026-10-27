import {getKisDailyCandles} from "@/lib/kis-stock-chart";
import {getKisStockQuote} from "@/lib/kis-stock-quote";
import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
const number=(v:unknown)=>Number(String(v??"").replace(/,/g,""));
export async function GET(req:Request){
 const url=new URL(req.url),symbol=String(url.searchParams.get("symbol")||"");
 if(!/^\d{6}$/.test(symbol))return NextResponse.json({error:"INVALID_SYMBOL"},{status:400});
 const period=String(url.searchParams.get("period")||"day");
 if(process.env.KM_STOCK_QUOTE_PROVIDER==="KIS"){
  try{
   const [candles,quote]=await Promise.all([getKisDailyCandles(symbol,period),getKisStockQuote(symbol)]);
   return NextResponse.json({source:"KIS_OFFICIAL_DAILY",tradeable:false,symbol,name:symbol,price:quote.price,change:quote.price-quote.previousClose,rate:(quote.price-quote.previousClose)/quote.previousClose*100,marketStatus:quote.marketStatus,asOf:quote.asOf,candles},{headers:{"Cache-Control":"no-store"}});
  }catch(e){console.warn("KIS_DAILY_FALLBACK",e instanceof Error?e.message:"UNAVAILABLE")}
 }

 
 try{
 const [quoteRes,historyRes]=await Promise.all([
 fetch("https://polling.finance.naver.com/api/realtime/domestic/stock/"+symbol,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{Accept:"application/json"}}),
 fetch("https://fchart.stock.naver.com/sise.nhn?symbol="+symbol+"&timeframe="+(period==="week"?"week":period==="month"?"month":"day")+"&count=1200&requestType=0",{cache:"no-store",signal:AbortSignal.timeout(8500),headers:{Accept:"application/xml"}})
 ]);
 if(!quoteRes.ok||!historyRes.ok)throw Error("NAVER_UPSTREAM_UNAVAILABLE");
 const q=await quoteRes.json(),xml=await historyRes.text();
 const item=q?.datas?.find((d:{itemCode?:string})=>d.itemCode===symbol);
 const matches=Array.from(xml.matchAll(/<item\s+data="(\d{8}\|[0-9|]+)"\s*\/>/g));
 const candles=matches.map(m=>{const [date,o,h,l,c,v]=m[1].split("|");return {time:date.slice(0,4)+"-"+date.slice(4,6)+"-"+date.slice(6,8),open:Number(o),high:Number(h),low:Number(l),close:Number(c),volume:Number(v)}})
 .filter(d=>Number.isSafeInteger(d.close)&&d.close>0&&d.open>0&&d.high>=Math.max(d.open,d.close)&&d.low<=Math.min(d.open,d.close)&&Number.isFinite(d.volume))
 .sort((a,b)=>a.time.localeCompare(b.time))
 .filter((d,i,a)=>i===0||d.time!==a[i-1].time);
 if(!item||candles.length===0)throw Error("NAVER_DATA_UNAVAILABLE");
 return NextResponse.json({source:"NAVER_UNOFFICIAL_PREVIEW",tradeable:false,symbol,name:item.stockName||symbol,price:number(item.closePrice),change:number(item.compareToPreviousClosePrice),rate:Number(item.fluctuationsRatio),marketStatus:item.marketStatus||"UNKNOWN",asOf:item.localTradedAt||null,candles},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"NAVER_PREVIEW_UNAVAILABLE",tradeable:false},{status:503})}
}
