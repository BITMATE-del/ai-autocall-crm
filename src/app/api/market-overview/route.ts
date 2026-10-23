import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const codes=["KOSPI","KOSDAQ"];
  const indices=await Promise.all(codes.map(async code=>{
   const res=await fetch("https://m.stock.naver.com/api/index/"+code+"/basic",{cache:"no-store",headers:{Accept:"application/json","User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(7000)});
   if(!res.ok)throw Error("INDEX_HTTP_"+res.status);
   const j=await res.json();
   const n=(v:unknown)=>Number(String(v??"").replace(/,/g,""));
   const x={code,value:n(j.closePrice),change:n(j.compareToPreviousClosePrice),rate:n(j.fluctuationsRatio),open:n(j.openPrice),high:n(j.highPrice),low:n(j.lowPrice),status:String(j.marketStatus||"UNKNOWN"),at:String(j.localTradedAt||"")};
   if(!Number.isFinite(x.value)||x.value<=0||!Number.isFinite(x.high)||!Number.isFinite(x.low))throw Error("INDEX_INVALID");
   return x;
  }));
  return NextResponse.json({indices,asOf:Date.now(),source:"NAVER_PUBLIC_REFERENCE"},{headers:{"Cache-Control":"public, s-maxage=15, stale-while-revalidate=20"}});
 }catch(e){const m=e instanceof Error?e.message:"INDEX_UNKNOWN";return NextResponse.json({error:"INDEX_UNAVAILABLE",reason:m.startsWith("INDEX_")?m:"INDEX_FETCH_FAILED"},{status:503})}
}
