import {NextRequest,NextResponse} from "next/server";
import {kisMarketRequest} from "@/lib/kis-stock-quote";
export const dynamic="force-dynamic";
const number=(v:unknown)=>{const n=Number(String(v??"").replace(/,/g,""));return Number.isSafeInteger(n)&&n>=0?n:null};
export async function GET(req:NextRequest){
 const symbol=req.nextUrl.searchParams.get("symbol")||"";
 if(!/^[0-9]{6}$/.test(symbol))return NextResponse.json({error:"INVALID_SYMBOL"},{status:400});
 try{
  const json=await kisMarketRequest("/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn","FHKST01010200",{FID_COND_MRKT_DIV_CODE:"J",FID_INPUT_ISCD:symbol}) as {output1?:Record<string,string>};
  const d=json.output1;if(!d)throw Error("EMPTY_ORDERBOOK");
  const asks:{price:number;qty:number}[]=[],bids:{price:number;qty:number}[]=[];
  for(let i=1;i<=10;i++){
   const ap=number(d["askp"+i]),av=number(d["askp_rsqn"+i]),bp=number(d["bidp"+i]),bv=number(d["bidp_rsqn"+i]);
   if(ap!==null&&ap>0&&av!==null)asks.push({price:ap,qty:av});
   if(bp!==null&&bp>0&&bv!==null)bids.push({price:bp,qty:bv});
  }
  if(!asks.length&&!bids.length)throw Error("EMPTY_LEVELS");
  return NextResponse.json({symbol,market:"KRX",asks,bids,totalAsk:number(d.total_askp_rsqn),totalBid:number(d.total_bidp_rsqn),asOf:new Date().toISOString(),source:"KIS_REST"},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  const raw=e instanceof Error?e.message:"UNKNOWN";
  // Diagnostic codes are intentionally limited to known categories; do not reveal credentials or upstream messages.
  const reason=raw.startsWith("KIS_AUTH_")||raw==="KIS_NOT_CONFIGURED"||raw==="KIS_TOKEN_STORAGE_NOT_CONFIGURED"?"AUTH":
   raw==="KIS_MARKET_HTTP_429"?"LIMIT":raw.startsWith("KIS_MARKET_HTTP_")?"HTTP":
   raw.startsWith("KIS_MARKET_RESPONSE_")?"UPSTREAM":
   raw==="EMPTY_ORDERBOOK"||raw==="EMPTY_LEVELS"?"EMPTY":"NETWORK";
  const kst=new Date(Date.now()+9*3600000),day=kst.getUTCDay(),minute=kst.getUTCHours()*60+kst.getUTCMinutes();
  const marketClosed=day===0||day===6||minute<540||minute>=930;
  console.error("KIS_ORDERBOOK_FETCH_FAILED",{symbol,reason,marketClosed,detail:raw.slice(0,70)});
  return NextResponse.json({error:"ORDERBOOK_UNAVAILABLE",reason,marketClosed},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
