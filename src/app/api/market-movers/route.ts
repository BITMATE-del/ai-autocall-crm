import {kisMarketRequest} from "@/lib/kis-stock-quote";
const n=(v:unknown)=>Number(String(v??"").replace(/,/g,""));
type KisRow=Record<string,string>;
function mapKis(rows:KisRow[]):Mover[]{
 const seen=new Set<string>();
 return rows.map(x=>({
 code:String(x.stck_shrn_iscd||x.mksc_shrn_iscd||"").trim(),
 name:String(x.hts_kor_isnm||"").trim(),
 market:"KRX",
 price:n(x.stck_prpr),change:n(x.prdy_vrss),rate:n(x.prdy_ctrt),
 tradingValue:n(x.acml_tr_pbmn||x.acml_tr_prc||x.acml_tr_amt||"0")
 })).filter(x=>/^\d{6}$/.test(x.code)&&x.name.length>0&&x.price>0&&Number.isFinite(x.rate)&&Number.isFinite(x.tradingValue)).filter(x=>{if(seen.has(x.code))return false;seen.add(x.code);return true});
}
async function kisMovers(){
 const common={FID_COND_MRKT_DIV_CODE:"J",FID_COND_SCR_DIV_CODE:"20170",FID_INPUT_ISCD:"0000",FID_INPUT_CNT_1:"10",FID_PRC_CLS_CODE:"0",FID_INPUT_PRICE_1:"0",FID_INPUT_PRICE_2:"1000000",FID_VOL_CNT:"0",FID_TRGT_CLS_CODE:"0",FID_TRGT_EXLS_CLS_CODE:"0",FID_DIV_CLS_CODE:"0",FID_RSFL_RATE1:"-30",FID_RSFL_RATE2:"30"};
 const fluct=(sort:string)=>kisMarketRequest("/uapi/domestic-stock/v1/ranking/fluctuation","FHPST01700000",{...common,FID_RANK_SORT_CLS_CODE:"0000",FID_RSFL_RATE1:"-30",FID_RSFL_RATE2:"30"});
 const volume=kisMarketRequest("/uapi/domestic-stock/v1/quotations/volume-rank","FHPST01710000",{
 FID_COND_MRKT_DIV_CODE:"J",FID_COND_SCR_DIV_CODE:"20171",FID_INPUT_ISCD:"0000",FID_DIV_CLS_CODE:"0",FID_BLNG_CLS_CODE:"3",
 FID_TRGT_CLS_CODE:"0",FID_TRGT_EXLS_CLS_CODE:"0000000000",FID_INPUT_PRICE_1:"",FID_INPUT_PRICE_2:"",FID_VOL_CNT:"",FID_INPUT_DATE_1:""});
 // Rank API results are top lists only, not a complete market-wide advance/decline census.
 const [up,amount]=await Promise.allSettled([fluct("0000"),volume]);
 const successful=(x:PromiseSettledResult<unknown>)=>x.status==="fulfilled"?(x.value as {output?:unknown}):null;
 const arr=(v:unknown)=>Array.isArray(v)?v as KisRow[]:[];
 const rankRows=mapKis(arr(successful(up)?.output));
 const active=mapKis(arr(successful(amount)?.output)).sort((a,b)=>b.tradingValue-a.tradingValue);
 const combined=[...new Map([...rankRows,...active].map(x=>[x.code,x])).values()];
 const rising=combined.filter(x=>x.rate>0).sort((a,b)=>b.rate-a.rate);
 const falling=combined.filter(x=>x.rate<0).sort((a,b)=>a.rate-b.rate);
 if(!rising.length&&!falling.length&&!active.length){const reasons=[up,amount].filter(x=>x.status==="rejected").map(x=>x.status==="rejected"&&x.reason instanceof Error?x.reason.message:"NO_ROWS").join(",");throw Error("KIS_RANKING_EMPTY_"+reasons)}
 const kst=new Date(Date.now()+32400000).toISOString();
 return {asOf:kst.slice(0,10).replace(/-/g,""),asOfTime:new Date().toISOString(),count:null,up:null,down:null,flat:null,rising,falling,active,source:"KIS_RANKING",note:"KIS 순위 API 상위 종목 결과. 전체 시장 종목 수·상승/하락 종목 수는 별도로 제공되지 않습니다."};
}
import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
type Mover={code:string;name:string;market:string;price:number;change:number;rate:number;tradingValue:number};
export async function GET(){
 if(process.env.KM_STOCK_QUOTE_PROVIDER==="KIS"){
 try{return NextResponse.json(await kisMovers(),{headers:{"Cache-Control":"public, s-maxage=45, stale-while-revalidate=45"}})}
 catch(e){console.error("KIS_RANKING_UNAVAILABLE",e instanceof Error?e.message:"ERROR");return NextResponse.json({error:"KIS_RANKING_UNAVAILABLE",source:"KIS_RANKING",message:"KIS 순위 조회 실패. 최신 순위 데이터를 표시하지 않습니다.",detail:"KIS_RANKING_TEMPORARILY_UNAVAILABLE"},{status:503})}
 }
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
