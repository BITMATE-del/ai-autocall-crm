export type KrQuote={symbol:string;price:number;previousClose:number;asOf:string;provider:"TWELVE_DATA";marketStatus:string};
export async function getKrStockQuote(symbol:string,forTrade=false):Promise<KrQuote>{
 if(!/^\d{6}$/.test(symbol))throw Error("INVALID_SYMBOL");
 if(forTrade&&process.env.KM_STOCK_INTERNAL_TRADING_ENABLED!=="true")throw Error("STOCK_TRADING_NOT_CONFIGURED");
 const key=process.env.TWELVE_DATA_API_KEY;
 if(!key)throw Error("TWELVE_DATA_API_KEY_REQUIRED");
 const local=new Date(Date.now()+32400000),day=local.getUTCDay(),mins=local.getUTCHours()*60+local.getUTCMinutes();
 const marketOpen=day!==0&&day!==6&&mins>=540&&mins<930;
 if(forTrade&&!marketOpen)throw Error("MARKET_NOT_TRADABLE");
 let reason="QUOTE_UNAVAILABLE";
 for(const mic of ["XKRX","XKOS"]){
  const url=new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol",symbol);url.searchParams.set("mic_code",mic);url.searchParams.set("apikey",key);
  const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(6500)});
  if(!res.ok){reason=res.status===401?"TWELVE_API_KEY_INVALID":res.status===403?"TWELVE_PLAN_ACCESS_DENIED":res.status===429?"TWELVE_RATE_LIMITED":res.status===404?"TWELVE_SYMBOL_NOT_FOUND":"TWELVE_HTTP_"+res.status;continue}
  const data=await res.json();
  if(data.status==="error"){const code=Number(data.code);reason=code===401?"TWELVE_API_KEY_INVALID":code===403?"TWELVE_PLAN_ACCESS_DENIED":code===429?"TWELVE_RATE_LIMITED":code===404?"TWELVE_SYMBOL_NOT_FOUND":"TWELVE_PROVIDER_ERROR_"+(Number.isInteger(code)?code:"UNKNOWN");continue}
  const returned=String(data.symbol||"").replace(/\D/g,"");
  if(returned!==symbol||String(data.mic_code||"").toUpperCase()!==mic||String(data.currency||"").toUpperCase()!=="KRW"){reason="QUOTE_IDENTITY_MISMATCH";continue}
  const price=Number(data.close),previousClose=Number(data.previous_close),timestamp=Number(data.last_quote_at);
  if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(previousClose)||previousClose<=0){reason="INVALID_QUOTE";continue}
  if(!Number.isFinite(timestamp)||timestamp<=0){reason="QUOTE_TIMESTAMP_MISSING";continue}
  const age=Date.now()-timestamp*1000;
  if(age< -3000||(forTrade&&age>15000)){reason="QUOTE_STALE";continue}
  return {symbol,price,previousClose,asOf:new Date(timestamp*1000).toISOString(),provider:"TWELVE_DATA",marketStatus:marketOpen?"REGULAR_SESSION":"CLOSED"};
 }
 throw Error(reason);
}
