/** Korea Investment & Securities market-data only. No order endpoints. */
import type {KrQuote} from "@/lib/kr-stock-quote";
type KisData={rt_cd?:string;msg1?:string;output?:Record<string,string>};
import {database} from "@/lib/auth";
import {createHash,createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
let tokenCache:{value:string;expires:number}|undefined;
let tokenPending:Promise<string>|undefined;
const host="https://openapi.koreainvestment.com:9443";
function cryptoKey(){const k=process.env.ACCOUNT_ENCRYPTION_KEY;if(!k||k.length<32)throw Error("KIS_TOKEN_STORAGE_NOT_CONFIGURED");return createHash("sha256").update(k).digest()}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",cryptoKey(),iv);return Buffer.concat([iv,cipher.update(value,"utf8"),cipher.final(),cipher.getAuthTag()]).toString("base64")}
function decrypt(value:string){const buf=Buffer.from(value,"base64"),iv=buf.subarray(0,12),tag=buf.subarray(buf.length-16),data=buf.subarray(12,buf.length-16),cipher=createDecipheriv("aes-256-gcm",cryptoKey(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString("utf8")}
export async function kisAccessToken(){
 const key=process.env.KIS_APP_KEY,secret=process.env.KIS_APP_SECRET;
 if(!key||!secret)throw Error("KIS_NOT_CONFIGURED");
 if(tokenCache&&Date.now()<tokenCache.expires)return tokenCache.value;
 if(!tokenPending)tokenPending=(async()=>{
 const c=await database().connect();
 try{
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(203306, 101)");
  await c.query("CREATE TABLE IF NOT EXISTS km_kis_auth_cache(id TEXT PRIMARY KEY, token_cipher TEXT, expires_at TIMESTAMPTZ, last_attempt_at TIMESTAMPTZ, last_error TEXT)");
  const row=(await c.query("SELECT token_cipher,expires_at,last_attempt_at,last_error FROM km_kis_auth_cache WHERE id='production' FOR UPDATE")).rows[0];
  if(row?.token_cipher&&Date.parse(row.expires_at)>Date.now()+120000){
   const value=decrypt(row.token_cipher);tokenCache={value,expires:Date.parse(row.expires_at)-60000};await c.query("COMMIT");return value;
  }
  if(row?.last_attempt_at&&Date.now()-Date.parse(row.last_attempt_at)<65000){const last=String(row.last_error||"UNKNOWN").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,50);await c.query("COMMIT");throw Error("KIS_AUTH_RATE_LIMIT_WAIT_"+last)}
  await c.query("INSERT INTO km_kis_auth_cache(id,last_attempt_at) VALUES('production',NOW()) ON CONFLICT(id) DO UPDATE SET last_attempt_at=NOW()");
  const r=await fetch(host+"/oauth2/tokenP",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({grant_type:"client_credentials",appkey:key,appsecret:secret}),signal:AbortSignal.timeout(9000),cache:"no-store"});
  const json=await r.json().catch(()=>({}));
  if(!r.ok||!json.access_token){
   const code=String(json?.error_code||json?.msg_cd||json?.code||"HTTP_"+r.status).replace(/[^a-zA-Z0-9_-]/g,"").slice(0,50);
   await c.query("UPDATE km_kis_auth_cache SET last_error=$1 WHERE id='production'",[code]);
   await c.query("COMMIT");
   console.warn("KIS_TOKEN_ISSUE",code);
   throw Error("KIS_AUTH_"+code);
  }
  const value=String(json.access_token),seconds=Math.min(86400,Math.max(120,Number(json.expires_in)||86400)),expires=Date.now()+seconds*1000;
  await c.query("UPDATE km_kis_auth_cache SET token_cipher=$1,expires_at=to_timestamp($2),last_error=NULL WHERE id='production'",[encrypt(value),expires/1000]);
  await c.query("COMMIT");tokenCache={value,expires:expires-60000};return value;
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
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
