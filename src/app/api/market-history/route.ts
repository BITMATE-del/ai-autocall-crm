import {kisMarketRequest} from "@/lib/kis-stock-quote";
import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const code=new URL(req.url).searchParams.get("code")||"";
 if(code!=="KOSPI"&&code!=="KOSDAQ")return NextResponse.json({error:"INVALID_CODE"},{status:400});
 if(process.env.KM_STOCK_QUOTE_PROVIDER==="KIS"){
  try{
   const iscd=code==="KOSPI"?"0001":"1001",date=new Date(Date.now()+32400000).toISOString().slice(0,10).replace(/-/g,"");
   const r=await kisMarketRequest("/uapi/domestic-stock/v1/quotations/inquire-index-daily-price","FHPUP02120000",{FID_PERIOD_DIV_CODE:"D",FID_COND_MRKT_DIV_CODE:"U",FID_INPUT_ISCD:iscd,FID_INPUT_DATE_1:date});
   const rows=Array.isArray(r.output2)?r.output2:[];
   const points=rows.map(x=>({date:String(x.stck_bsop_date||x.bstp_nmix_dt||""),close:Number(x.bstp_nmix_prpr)})).filter(x=>/^\\d{8}$/.test(x.date)&&Number.isFinite(x.close)&&x.close>0).sort((a,b)=>a.date.localeCompare(b.date));
   if(points.length<2)throw Error("KIS_INDEX_HISTORY_EMPTY");
   return NextResponse.json({code,period:"DAY",points,source:"KIS_OFFICIAL_INDEX_HISTORY"},{headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=300"}});
  }catch(e){console.warn("KIS_INDEX_HISTORY_FALLBACK",e instanceof Error?e.message:"UNKNOWN")}
 }

 try{
  const r=await fetch("https://api.stock.naver.com/chart/domestic/index/"+code+"?periodType=dayCandle",{cache:"no-store",signal:AbortSignal.timeout(6500)});
  if(!r.ok)throw Error("INDEX_HISTORY_UNAVAILABLE");
  const j=await r.json();
  const points=(Array.isArray(j?.priceInfos)?j.priceInfos:[]).map((x:{localDate:string;closePrice:number})=>({date:String(x.localDate),close:Number(x.closePrice)})).filter((x:{date:string;close:number})=>/^\d{8}$/.test(x.date)&&Number.isFinite(x.close)&&x.close>0).sort((a:{date:string},b:{date:string})=>a.date.localeCompare(b.date)).slice(-110);
  if(points.length<20)throw Error("INDEX_HISTORY_EMPTY");
  return NextResponse.json({code,period:"DAY",points,source:"NAVER_REFERENCE"},{headers:{"Cache-Control":"public, s-maxage=300, stale-while-revalidate=600"}});
 }catch{return NextResponse.json({error:"INDEX_HISTORY_UNAVAILABLE"},{status:503})}
}
