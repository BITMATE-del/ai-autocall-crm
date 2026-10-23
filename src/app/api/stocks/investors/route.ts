import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const symbol=new URL(req.url).searchParams.get("symbol")||"";
 if(!/^\d{6}$/.test(symbol))return NextResponse.json({error:"INVALID_SYMBOL"},{status:400});
 try{
  const r=await fetch("https://m.stock.naver.com/front-api/stock/domestic/trend?code="+symbol,{cache:"no-store",signal:AbortSignal.timeout(8000),headers:{"User-Agent":"Mozilla/5.0",Accept:"application/json"}});
  if(!r.ok)throw Error("UPSTREAM_"+r.status);
  const payload=await r.json();
  const rows=payload?.result?.items;
  if(!Array.isArray(rows))throw Error("INVALID_TREND");
  const n=(v:unknown)=>{const x=Number(String(v??"").replace(/,/g,""));return Number.isFinite(x)?x:null};
  const items=rows.slice(0,20).map((x:any)=>({date:String(x.localTradedAt||""),individual:n(x.krx?.individualNetVolume),foreign:n(x.krx?.foreignNetVolume),organization:n(x.krx?.organizationNetVolume),volume:n(x.krx?.tradingVolume),close:n(x.krx?.closingPrice),changeRate:n(x.krx?.changeRate)})).filter((x:any)=>/^\d{4}-\d{2}-\d{2}$/.test(x.date));
  return NextResponse.json({symbol,items,source:"NAVER_PUBLIC_KRX_TREND",unit:"shares",delayed:true},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"INVESTOR_TREND_UNAVAILABLE"},{status:503})}
}
