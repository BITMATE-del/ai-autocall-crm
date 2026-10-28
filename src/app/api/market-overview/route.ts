import {kisMarketRequest} from "@/lib/kis-stock-quote";
import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(){
 if(process.env.KM_STOCK_QUOTE_PROVIDER==="KIS"){
  try{
   const n=(v:unknown)=>Number(String(v??"").replace(/,/g,""));
   const codes=[["KOSPI","0001"],["KOSDAQ","1001"]] as const;
   const indices=await Promise.all(codes.map(async([code,iscd])=>{
    const response=await kisMarketRequest("/uapi/domestic-stock/v1/quotations/inquire-index-price","FHPUP02100000",{FID_COND_MRKT_DIV_CODE:"U",FID_INPUT_ISCD:iscd});
    const d=(response as unknown as {output?:Record<string,string>}).output||{};
    const value=n(d.bstp_nmix_prpr),change=n(d.bstp_nmix_prdy_vrss),rate=n(d.bstp_nmix_prdy_ctrt);
    const open=n(d.bstp_nmix_oprc),high=n(d.bstp_nmix_hgpr),low=n(d.bstp_nmix_lwpr);
    if(!Number.isFinite(value)||value<=0||!Number.isFinite(open)||open<=0||!Number.isFinite(high)||high<=0||!Number.isFinite(low)||low<=0)throw Error("KIS_INDEX_INVALID_"+code);
    const sign=String(d.prdy_vrss_sign||"");
    const signed=sign==="4"||sign==="5"?-Math.abs(change):sign==="1"||sign==="2"?Math.abs(change):change;
    const signedRate=sign==="4"||sign==="5"?-Math.abs(rate):sign==="1"||sign==="2"?Math.abs(rate):rate;
    const kst=new Date(Date.now()+32400000),day=kst.getUTCDay(),mins=kst.getUTCHours()*60+kst.getUTCMinutes();
    return {code,value,change:signed,rate:signedRate,open,high,low,status:day>=1&&day<=5&&mins>=540&&mins<930?"OPEN":"CLOSED",at:new Date().toISOString()};
   }));
   return NextResponse.json({indices,asOf:Date.now(),source:"KIS_OFFICIAL_INDEX"},{headers:{"Cache-Control":"public, s-maxage=25, stale-while-revalidate=20"}});
  }catch(e){console.warn("KIS_INDEX_FALLBACK",e instanceof Error?e.message:"UNKNOWN")}
 }
 try{
  const codes=["KOSPI","KOSDAQ"];
  const indices=await Promise.all(codes.map(async code=>{
   const res=await fetch("https://m.stock.naver.com/api/index/"+code+"/basic",{cache:"no-store",headers:{Accept:"application/json","User-Agent":"Mozilla/5.0"},signal:AbortSignal.timeout(7000)});
   if(!res.ok)throw Error("INDEX_HTTP_"+res.status);
   const basic=await res.json();
   let j=basic;try{const detail=await fetch("https://polling.finance.naver.com/api/realtime/domestic/index/"+code,{cache:"no-store",signal:AbortSignal.timeout(5000)});if(detail.ok){const d=await detail.json();if(d?.datas?.[0]?.itemCode===code)j=d.datas[0]}}catch{}
   const n=(v:unknown)=>Number(String(v??"").replace(/,/g,""));
   const x={code,value:n(j.closePrice),change:n(j.compareToPreviousClosePrice),rate:n(j.fluctuationsRatio),open:n(j.openPrice),high:n(j.highPrice),low:n(j.lowPrice),status:String(j.marketStatus||"UNKNOWN"),at:String(j.localTradedAt||"")};
   if(!Number.isFinite(x.value)||x.value<=0||!Number.isFinite(x.high)||!Number.isFinite(x.low))throw Error("INDEX_INVALID");
   return x;
  }));
  return NextResponse.json({indices,asOf:Date.now(),source:"NAVER_PUBLIC_REFERENCE"},{headers:{"Cache-Control":"public, s-maxage=15, stale-while-revalidate=20"}});
 }catch(e){const m=e instanceof Error?e.message:"INDEX_UNKNOWN";return NextResponse.json({error:"INDEX_UNAVAILABLE",reason:m.startsWith("INDEX_")?m:"INDEX_FETCH_FAILED"},{status:503})}
}
