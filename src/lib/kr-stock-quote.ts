/** Koscom licensed market data. Trading is fail-closed without a production API key. */
export type KrQuote={symbol:string;price:number;previousClose:number;asOf:string;provider:"KOSCOM";marketStatus:string};
const nowInSeoul=()=>new Date(Date.now()+9*3600000);
function quoteTime(raw:unknown){
 const digits=String(raw??"").replace(/\D/g,"");
 if(digits.length<6||digits==="00000000")throw Error("QUOTE_TIMESTAMP_MISSING");
 const h=Number(digits.slice(0,2)),m=Number(digits.slice(2,4)),s=Number(digits.slice(4,6));
 if(h>23||m>59||s>59)throw Error("QUOTE_TIMESTAMP_INVALID");
 const date=nowInSeoul();return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),h-9,m,s,Number(digits.slice(6,8)||0)*10));
}
export async function getKrStockQuote(symbol:string):Promise<KrQuote>{
 if(!/^\d{6}$/.test(symbol))throw Error("INVALID_SYMBOL");
 if(process.env.KM_STOCK_INTERNAL_TRADING_ENABLED!=="true")throw Error("STOCK_TRADING_NOT_CONFIGURED");
 const key=process.env.KOSCOM_API_KEY;
 if(!key)throw Error("KOSCOM_API_KEY_REQUIRED");
 if(process.env.KOSCOM_ENV!=="production")throw Error("KOSCOM_PRODUCTION_REQUIRED");
 const today=nowInSeoul(),day=today.getUTCDay(),minute=today.getUTCHours()*60+today.getUTCMinutes();
 if(day===0||day===6||minute<540||minute>=930)throw Error("MARKET_NOT_TRADABLE");
 const markets=["kospi","kosdaq"] as const;
 let lastError="QUOTE_UNAVAILABLE";
 for(const market of markets){
  const url=new URL("https://oap.k-mydata.org/v3/market/realtime/"+market+"/stocks/"+symbol+"/price");
  url.searchParams.set("apikey",key);
  const resp=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{Accept:"application/json"}}).catch(()=>null);
  if(!resp){lastError="KOSCOM_NETWORK_ERROR";continue}
  if(resp.status===401||resp.status===403)throw Error("KOSCOM_ACCESS_DENIED");
  if(!resp.ok){lastError="QUOTE_UNAVAILABLE";continue}
  const body=await resp.json().catch(()=>null);
  const data=body?.result?.output??body?.result??body?.output??body;
  if(!data||Array.isArray(data)){lastError="INVALID_QUOTE";continue}
  const returned=String(data.isuSrtCd??"").replace(/\D/g,"").slice(-6);
  if(returned&&returned!==symbol)throw Error("QUOTE_SYMBOL_MISMATCH");
  const price=Number(data.trdPrc),diff=Math.abs(Number(data.cmpprevddPrc??0));
  const kind=String(data.cmpprevddTpCd??"");
  const prev=kind==="2"||kind==="1"||kind==="6"||kind==="7"?price-diff:kind==="4"||kind==="5"||kind==="8"||kind==="9"?price+diff:price;
  if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(prev)||prev<=0)throw Error("INVALID_QUOTE");
  const asOf=quoteTime(data.trdTm);
  const age=Date.now()-asOf.getTime();
  if(age< -3000||age>12000)throw Error("QUOTE_STALE");
  if(["0","31000000","41000000","81000000"].includes(String(data.trdTm??"")))throw Error("MARKET_NOT_TRADABLE");
  return {symbol,price,previousClose:prev,asOf:asOf.toISOString(),provider:"KOSCOM",marketStatus:"REGULAR_SESSION"};
 }
 throw Error(lastError);
}
