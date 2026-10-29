import {NextResponse} from "next/server";
import {kisMarketRequest} from "@/lib/kis-stock-quote";
export const dynamic="force-dynamic";
const num=(v:unknown)=>{const n=Number(String(v??"").replace(/,/g,""));return Number.isFinite(n)&&n>0?n:null};
export async function GET(req:Request){
 const symbol=new URL(req.url).searchParams.get("symbol")||"";
 if(!/^\d{6}$/.test(symbol))return NextResponse.json({error:"INVALID_SYMBOL"},{status:400});
 try{
  const r=await kisMarketRequest("/uapi/domestic-stock/v1/quotations/inquire-price","FHKST01010100",{FID_COND_MRKT_DIV_CODE:"J",FID_INPUT_ISCD:symbol});
  const d=(r as unknown as {output?:Record<string,string>}).output;
  if(!d||!num(d.stck_prpr))throw Error("KIS_STOCK_DETAIL_EMPTY");
  return NextResponse.json({symbol,source:"KIS",price:num(d.stck_prpr),previousClose:num(d.stck_sdpr),open:num(d.stck_oprc),high:num(d.stck_hgpr),low:num(d.stck_lwpr),volume:num(d.acml_vol),tradingValue:num(d.acml_tr_pbmn),marketCap:num(d.hts_avls),listedShares:num(d.lstn_stcn),per:num(d.per),pbr:num(d.pbr),eps:num(d.eps),bps:num(d.bps),high52:num(d.w52_hgpr),low52:num(d.w52_lwpr),asOf:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.warn("KIS_STOCK_DETAIL_FAILED",e instanceof Error?e.message:"ERROR");return NextResponse.json({error:"STOCK_DETAIL_UNAVAILABLE"},{status:503})}
}
