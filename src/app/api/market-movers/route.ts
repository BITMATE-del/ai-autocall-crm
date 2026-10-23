import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
type Mover={code:string;name:string;market:string;price:number;change:number;rate:number;tradingValue:number};
export async function GET(){
 try{
  const res=await fetch("https://aikstockdata.com/data/public/quotes.json",{cache:"no-store",signal:AbortSignal.timeout(10500),headers:{Accept:"application/json"}});
  if(!res.ok)throw Error("MARKET_DATA_UNAVAILABLE");
  const data=await res.json();
  const raw=Array.isArray(data.items)?data.items:[];
  const asOf=String(data.basDt||raw[0]?.basDt||"");
  if(!/^\d{8}$/.test(asOf))throw Error("MARKET_DATE_UNKNOWN");
  const all:Mover[]=raw.map((x:Record<string,unknown>)=>({code:String(x["종목코드"]||""),name:String(x["종목명"]||""),market:String(x.mrktCtg||""),price:Number(x.clpr),change:Number(x.vs),rate:Number(x.fltRt),tradingValue:Number(x.trPrc)})).filter((x:Mover)=>/^\d{6}$/.test(x.code)&&x.name.length>0&&(x.market==="KOSPI"||x.market==="KOSDAQ")&&Number.isFinite(x.price)&&x.price>0&&Number.isFinite(x.rate)&&Number.isFinite(x.change)&&Number.isFinite(x.tradingValue));
  if(all.length<1500)throw Error("MARKET_DATA_INCOMPLETE");
  const asc=[...all].sort((a,b)=>a.rate-b.rate);
  const rising=[...asc].reverse().filter(x=>x.rate>0).slice(0,60);
  const falling=asc.filter(x=>x.rate<0).slice(0,60);
  const active=[...all].sort((a,b)=>Math.abs(b.rate)-Math.abs(a.rate)).slice(0,60);
  return NextResponse.json({asOf,count:all.length,up:all.filter(x=>x.rate>0).length,down:all.filter(x=>x.rate<0).length,flat:all.filter(x=>x.rate===0).length,rising,falling,active,source:"DAILY_MARKET_SNAPSHOT",note:"Daily market close snapshot, not live quotes"},{headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=600"}});
 }catch{return NextResponse.json({error:"MARKET_MOVERS_UNAVAILABLE"},{status:503})}
}
