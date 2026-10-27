/** Korea Investment & Securities market-data only. No order endpoints. */
import type {KrQuote} from "@/lib/kr-stock-quote";
type KisData={rt_cd?:string;msg1?:string;output?:Record<string,string>};
let tokenCache:{value:string;expires:number}|undefined;
let tokenPending:Promise<string>|undefined;
const host="https://openapi.koreainvestment.com:9443";
export async function kisAccessToken(){
 const key=process.env.KIS_APP_KEY,secret=process.env.KIS_APP_SECRET;
 if(!key||!secret)throw Error("KIS_NOT_CONFIGURED");
 if(tokenCache&&Date.now()<tokenCache.expires)return tokenCache.value;
 if(!tokenPending)tokenPending=(async()=>{
 const r=await fetch(host+"/oauth2/tokenP",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({grant_type:"client_credentials",appkey:key,appsecret:secret}),signal:AbortSignal.timeout(7000),cache:"no-store"});
 if(!r.ok)throw Error("KIS_AUTH_UNAVAILABLE");
 const json=await r.json();if(!json.access_token)throw Error("KIS_AUTH_REJECTED");
 const value=String(json.access_token);const seconds=Math.max(60,Math.min(82800,Number(json.expires_in)||21600));
 tokenCache={value,expires:Date.now()+seconds*1000-60000};return value;
 })().finally(()=>{tokenPending=undefined});
 return tokenPending;
}
export async function getKisStockQuote(symbol:string):Promise<KrQuote>{
 if(!/^\d{6}$/.test(symbol))throw Error("INVALID_SYMBOL");
 const key=process.env.KIS_APP_KEY,secret=process.env.KIS_APP_SECRET;
 if(!key||!secret)throw Error("KIS_NOT_CONFIGURED");
 const access=await kisAccessToken();
 const url=new URL(host+"/uapi/domestic-stock/v1/quotations/inquire-price");
 url.searchParams.set("FID_COND_MRKT_DIV_CODE","J");
 url.searchParams.set("FID_INPUT_ISCD",symbol);
 const r=await fetch(url,{cache:"no-store",headers:{"authorization":"Bearer "+access,"appkey":key,"appsecret":secret,"tr_id":"FHKST01010100","custtype":"P"},signal:AbortSignal.timeout(7000)});
 if(!r.ok)throw Error("KIS_QUOTE_HTTP_"+r.status);
 const body=await r.json() as KisData;
 if(body.rt_cd!=="0"||!body.output)throw Error("KIS_QUOTE_UNAVAILABLE");
 const d=body.output;const price=Number(d.stck_prpr),previousClose=Number(d.stck_sdpr);
 if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(previousClose)||previousClose<=0)throw Error("KIS_INVALID_PRICE");
 // REST current-price response does not establish a trustworthy complete quote timestamp.
 // Do not use this adapter to authorize trading until independently verified.
 const asOf=new Date().toISOString();
 const kst=new Date(Date.now()+9*3600000),day=kst.getUTCDay(),minutes=kst.getUTCHours()*60+kst.getUTCMinutes();
 return {symbol,price,previousClose,asOf,provider:"KIS_REST",marketStatus:day>=1&&day<=5&&minutes>=540&&minutes<930?"REGULAR_SESSION":"CLOSED"};
}

export async function kisMarketRequest(path:string,trId:string,params:Record<string,string>){
 const key=process.env.KIS_APP_KEY,secret=process.env.KIS_APP_SECRET;
 if(!key||!secret)throw Error("KIS_NOT_CONFIGURED");
 const access=await kisAccessToken();
 const url=new URL(host+path);
 for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
 const r=await fetch(url,{cache:"no-store",headers:{"authorization":"Bearer "+access,"appkey":key,"appsecret":secret,"tr_id":trId,"custtype":"P"},signal:AbortSignal.timeout(8500)});
 if(!r.ok)throw Error("KIS_MARKET_HTTP_"+r.status);
 const body=await r.json();
 if(body?.rt_cd!=="0")throw Error("KIS_MARKET_RESPONSE_"+String(body?.msg_cd||"ERROR"));
 return body as {rt_cd:string;output1?:Record<string,string>;output2?:Record<string,string>[]};
}

/** Trade authorization requires a dated, recent official KIS execution, never receipt time. */
export async function getKisTradeQuote(symbol:string):Promise<KrQuote>{
 if(!/^\d{6}$/.test(symbol))throw Error("INVALID_SYMBOL");
 const now=Date.now(),kst=new Date(now+9*3600000),day=kst.getUTCDay(),min=kst.getUTCHours()*60+kst.getUTCMinutes();
 if(day<1||day>5||min<540||min>=930)throw Error("MARKET_NOT_TRADABLE");
 const body=await kisMarketRequest("/uapi/domestic-stock/v1/quotations/inquire-ccnl","FHKST01010300",{FID_COND_MRKT_DIV_CODE:"J",FID_INPUT_ISCD:symbol});
 const item=(body as unknown as {output?:Record<string,string>[]}).output?.[0];
 const hour=String(item?.stck_cntg_hour||"");
 const price=Number(item?.stck_pbpr??item?.stck_prpr);
 if(!/^\\d{6}$/.test(hour)||!Number.isSafeInteger(price)||price<=0)throw Error("KIS_EXECUTION_INVALID");
 const previousClose=(await getKisStockQuote(symbol)).previousClose;
 const date=kst.toISOString().slice(0,10);
 const asOfDate=new Date(date+"T"+hour.slice(0,2)+":"+hour.slice(2,4)+":"+hour.slice(4,6)+"+09:00");
 const age=now-asOfDate.getTime();
 if(!Number.isFinite(age)||age< -5000||age>60000)throw Error("KIS_EXECUTION_STALE");
 return {symbol,price,previousClose,asOf:asOfDate.toISOString(),provider:"KIS_REST",marketStatus:"REGULAR_SESSION"};
}
