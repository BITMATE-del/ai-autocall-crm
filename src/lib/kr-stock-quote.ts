/** Licensed KIS quotation feed only. Never use fabricated, scraped or stale prices for settlement. */
let token:{value:string;until:number}|undefined;
export type KrQuote={symbol:string;price:number;previousClose:number;asOf:string;provider:"KIS";marketStatus:string};
export async function getKrStockQuote(symbol:string):Promise<KrQuote>{
 if(!/^\d{6}$/.test(symbol))throw Error("INVALID_SYMBOL");
 const key=process.env.KIS_APP_KEY,secret=process.env.KIS_APP_SECRET;
 if(!key||!secret||process.env.KM_STOCK_INTERNAL_TRADING_ENABLED!=="true")throw Error("STOCK_TRADING_NOT_CONFIGURED");
 if(!token||token.until<Date.now()+60000){
  const r=await fetch("https://openapi.koreainvestment.com:9443/oauth2/tokenP",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({grant_type:"client_credentials",appkey:key,appsecret:secret}),cache:"no-store",signal:AbortSignal.timeout(6000)});
  if(!r.ok)throw Error("QUOTE_AUTH_FAILED");const j=await r.json();if(!j.access_token)throw Error("QUOTE_AUTH_FAILED");
  token={value:j.access_token,until:Date.now()+Math.min(Number(j.expires_in||3600),3600)*1000};
 }
 const url="https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD="+symbol;
 const r=await fetch(url,{headers:{authorization:"Bearer "+token.value,appkey:key,appsecret:secret,tr_id:"FHKST01010100",custtype:"P"},cache:"no-store",signal:AbortSignal.timeout(6000)});
 if(!r.ok)throw Error("QUOTE_UNAVAILABLE");const j=await r.json();
 if(j.rt_cd!=="0"||!j.output)throw Error("QUOTE_UNAVAILABLE");
 const x=j.output,price=Number(x.stck_prpr),previousClose=Number(x.stck_sdpr);
 if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(previousClose)||previousClose<=0)throw Error("INVALID_QUOTE");
 const kst=new Date(Date.now()+9*3600000),day=kst.getUTCDay(),min=kst.getUTCHours()*60+kst.getUTCMinutes();
 const active=day>=1&&day<=5&&min>=540&&min<930;
 if(!active||x.temp_stop_yn==="Y"||x.trht_yn==="Y")throw Error("MARKET_NOT_TRADABLE");
 // KIS basic price REST does not prove quote freshness to the second. No live-price settlement without a timestamped licensed feed.
 if(process.env.KM_STOCK_ALLOW_KIS_REST_QUOTE!=="true")throw Error("TIMESTAMPED_QUOTE_REQUIRED");
 return {symbol,price,previousClose,asOf:new Date().toISOString(),provider:"KIS",marketStatus:"REGULAR_SESSION_REST_REFERENCE"};
}
