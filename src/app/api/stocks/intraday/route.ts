import {getKisMinuteCandles} from "@/lib/kis-stock-chart";
import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
type Bar={time:number;open:number;high:number;low:number;close:number;volume:number};
export async function GET(req:Request){
 const u=new URL(req.url),symbol=u.searchParams.get("symbol")||"",period=u.searchParams.get("period")||"minute1";
 if(!/^\d{6}$/.test(symbol)||!["minute1","minute3","minute5","minute15"].includes(period))return NextResponse.json({error:"INVALID_QUERY"},{status:400});
 const size=period==="minute3"?3:period==="minute5"?5:period==="minute15"?15:1;
 if(process.env.KM_STOCK_QUOTE_PROVIDER==="KIS"){
  try{const candles=await getKisMinuteCandles(symbol,size);
   return NextResponse.json({symbol,period,source:"KIS_OFFICIAL_MINUTE",approximateOHLC:false,candles},{headers:{"Cache-Control":"no-store"}});
  }catch(e){console.warn("KIS_MINUTE_FALLBACK",e instanceof Error?e.message:"UNAVAILABLE")}
 }

 try{
  const upstream=await fetch("https://fchart.stock.naver.com/sise.nhn?symbol="+symbol+"&timeframe=minute&count=5000&requestType=0",{cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!upstream.ok)throw Error("UPSTREAM_ERROR");
  const source=await upstream.text();
  const bars:Bar[]=[];let lastDay="",prevAccum=0,prevPrice=0;
  for(const m of source.matchAll(/<item data="([^"]+)"\s*\/>/g)){
   const fields=m[1].split("|"),date=fields[0],price=Number(fields[4]),acc=Number(fields[5]);
   if(!/^\d{12}$/.test(date)||!Number.isSafeInteger(price)||price<=0||!Number.isFinite(acc))continue;
   const day=date.slice(0,8),clockMinutes=Number(date.slice(8,10))*60+Number(date.slice(10,12));
   const bucket=Math.floor(clockMinutes/size)*size;
   const time=(Date.UTC(Number(day.slice(0,4)),Number(day.slice(4,6))-1,Number(day.slice(6,8)),0,bucket)-32400000)/1000;
   const sameDay=day===lastDay;
   const volume=sameDay?Math.max(0,acc-prevAccum):Math.max(0,acc);
   if(!sameDay)prevPrice=0;
   lastDay=day;prevAccum=acc;
   const opening=sameDay&&prevPrice>0?prevPrice:price;prevPrice=price;
   const prev=bars[bars.length-1];
   if(prev&&prev.time===time){prev.high=Math.max(prev.high,price);prev.low=Math.min(prev.low,price);prev.close=price;prev.volume+=volume}
   else bars.push({time,open:opening,high:Math.max(opening,price),low:Math.min(opening,price),close:price,volume});
  }
  if(!bars.length)throw Error("NO_MINUTE_DATA");
  return NextResponse.json({symbol,period,source:"NAVER_MINUTE_LAST_PRICE",approximateOHLC:true,ohlcMethod:"open=previous sampled price, high/low=extremes of sampled prices; not exchange OHLC",candles:bars.slice(-5000)},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"MINUTE_DATA_UNAVAILABLE"},{status:503})}
}
