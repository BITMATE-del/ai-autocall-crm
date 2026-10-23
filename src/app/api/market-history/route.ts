import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const code=new URL(req.url).searchParams.get("code")||"";
 if(code!=="KOSPI"&&code!=="KOSDAQ")return NextResponse.json({error:"INVALID_CODE"},{status:400});
 try{
  const r=await fetch("https://api.stock.naver.com/chart/domestic/index/"+code+"?periodType=dayCandle",{cache:"no-store",signal:AbortSignal.timeout(6500)});
  if(!r.ok)throw Error("INDEX_HISTORY_UNAVAILABLE");
  const j=await r.json();
  const points=(Array.isArray(j?.priceInfos)?j.priceInfos:[]).map((x:{localDate:string;closePrice:number})=>({date:String(x.localDate),close:Number(x.closePrice)})).filter((x:{date:string;close:number})=>/^\d{8}$/.test(x.date)&&Number.isFinite(x.close)&&x.close>0).sort((a:{date:string},b:{date:string})=>a.date.localeCompare(b.date)).slice(-110);
  if(points.length<20)throw Error("INDEX_HISTORY_EMPTY");
  return NextResponse.json({code,period:"DAY",points,source:"NAVER_REFERENCE"},{headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=600"}});
 }catch{return NextResponse.json({error:"INDEX_HISTORY_UNAVAILABLE"},{status:503})}
}
