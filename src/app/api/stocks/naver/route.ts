import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
const number=(v:unknown)=>Number(String(v??"").replace(/,/g,""));
export async function GET(req:Request){
 const url=new URL(req.url),symbol=String(url.searchParams.get("symbol")||"");
 if(!/^\d{6}$/.test(symbol))return NextResponse.json({error:"INVALID_SYMBOL"},{status:400});
 const period=String(url.searchParams.get("period")||"day");
 
 try{
 const minuteSize=period==="minute3"?3:period==="minute5"?5:period==="minute15"?15:1;
 const isMinute=["minute1","minute3","minute5","minute15"].includes(period);
 const [quoteRes,historyRes]=await Promise.all([
 fetch("https://polling.finance.naver.com/api/realtime/domestic/stock/"+symbol,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{Accept:"application/json"}}),
 fetch("https://fchart.stock.naver.com/sise.nhn?symbol="+symbol+"&timeframe="+(isMinute?"minute":period==="week"?"week":period==="month"?"month":"day")+"&count="+(isMinute?"5000":"1200")+"&requestType=0",{cache:"no-store",signal:AbortSignal.timeout(8500),headers:{Accept:"application/xml"}})
 ]);
 if(!quoteRes.ok||!historyRes.ok)throw Error("NAVER_UPSTREAM_UNAVAILABLE");
 const q=await quoteRes.json(),xml=await historyRes.text();
 const item=q?.datas?.find((d:{itemCode?:string})=>d.itemCode===symbol);
 const matches=Array.from(xml.matchAll(/<item\\s+data="([^"]+)"\\s*\\/>/g));
 const candles=isMinute?(()=>{
  const bars:{time:number;open:number;high:number;low:number;close:number;volume:number}[]=[];
  let priorDay="",priorVolume=0;
  for(const m of matches){
   const [date,, , ,value,acc]=m[1].split("|");
   if(!/^\\d{12}$/.test(date))continue;
   const price=Number(value),total=Number(acc);
   if(!Number.isSafeInteger(price)||price<=0||!Number.isFinite(total))continue;
   const day=date.slice(0,8),minute=Number(date.slice(8,10))*60+Number(date.slice(10,12));
   const bucket=Math.floor(minute/minuteSize)*minuteSize;
   const timestamp=Date.UTC(Number(day.slice(0,4)),Number(day.slice(4,6))-1,Number(day.slice(6,8)),0,bucket)-9*3600000;
   const volume=day===priorDay?Math.max(0,total-priorVolume):Math.max(0,total);
   priorDay=day;priorVolume=total;
   const last=bars[bars.length-1];
   if(last&&last.time===timestamp/1000){last.high=Math.max(last.high,price);last.low=Math.min(last.low,price);last.close=price;last.volume+=volume}
   else bars.push({time:timestamp/1000,open:price,high:price,low:price,close:price,volume});
  }
  return bars.slice(-5000);
 })():matches.map(m=>{const [date,o,h,l,c,v]=m[1].split("|");return {time:date.slice(0,4)+"-"+date.slice(4,6)+"-"+date.slice(6,8),open:Number(o),high:Number(h),low:Number(l),close:Number(c),volume:Number(v)}})
 .filter(d=>Number.isSafeInteger(d.close)&&d.close>0&&d.open>0&&d.high>=Math.max(d.open,d.close)&&d.low<=Math.min(d.open,d.close)&&Number.isFinite(d.volume))
 .sort((a,b)=>String(a.time).localeCompare(String(b.time)))
 .filter((d,i,a)=>i===0||d.time!==a[i-1].time);
 if(!item||candles.length===0)throw Error("NAVER_DATA_UNAVAILABLE");
 return NextResponse.json({source:"NAVER_UNOFFICIAL_PREVIEW",tradeable:false,approximateOHLC:isMinute,symbol,name:item.stockName||symbol,price:number(item.closePrice),change:number(item.compareToPreviousClosePrice),rate:Number(item.fluctuationsRatio),marketStatus:item.marketStatus||"UNKNOWN",asOf:item.localTradedAt||null,candles},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"NAVER_PREVIEW_UNAVAILABLE",tradeable:false},{status:503})}
}
