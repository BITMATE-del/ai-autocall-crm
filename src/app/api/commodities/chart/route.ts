import {NextResponse} from "next/server";
import {metalCandles,metalCurrent,metalSymbol} from "@/lib/metal-feed";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const symbol=new URL(req.url).searchParams.get("symbol")||"XAUUSD";
 if(!metalSymbol(symbol))return NextResponse.json({error:"UNSUPPORTED_SYMBOL"},{status:400});
 try{
 const now=Date.now();
 const [recent,quote]=await Promise.all([metalCandles(symbol,now-90*60000,now),metalCurrent(symbol)]);
 const bars=recent.filter(x=>x.at+60000<=now).map(x=>({time:Math.floor(x.at/1000),value:x.close})).sort((a,b)=>a.time-b.time);
 return NextResponse.json({symbol,source:quote.source,price:quote.price,asOf:quote.timestamp,bars},{headers:{"Cache-Control":"no-store"}});
 }catch(e){const reason=e instanceof Error?e.message:"FEED_UNAVAILABLE";console.error("GOLD_CANDLE_CHART_UNAVAILABLE",{symbol,reason});return NextResponse.json({error:"METAL_CANDLE_FEED_UNAVAILABLE",reason},{status:503})}
}
