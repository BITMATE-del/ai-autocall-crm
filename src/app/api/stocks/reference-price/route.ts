import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const symbol=new URL(req.url).searchParams.get("symbol")||"";
 if(!/^\d{6}$/.test(symbol))return NextResponse.json({error:"INVALID_SYMBOL"},{status:400});
 try{
  const r=await fetch("https://m.stock.naver.com/api/stock/"+symbol+"/basic",{cache:"no-store",signal:AbortSignal.timeout(6500)});
  if(!r.ok)throw Error("UNAVAILABLE");
  const d=await r.json();const price=Number(String(d.closePrice||"").replace(/,/g,""));
  if(!Number.isFinite(price)||price<=0)throw Error("INVALID_PRICE");
  return NextResponse.json({symbol,name:String(d.stockName||symbol),price,asOf:d.localTradedAt||null,source:"NAVER_REFERENCE",tradeable:false},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"REFERENCE_QUOTE_UNAVAILABLE"},{status:503})}
}
