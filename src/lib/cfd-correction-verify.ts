import {metalSettlement,metalSymbol} from "@/lib/metal-feed";
const cryptoSymbols=new Set(["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT"]);
export type OriginalCFD={id:string;symbol:string;direction:string;amount_krw:string;entry_price:string;exit_price:string|null;result:string|null;payout_krw:string|null;status:string;expires_at:string};
export async function verifyCFDOutcome(order:OriginalCFD){
if(order.status!=="SETTLED")throw Error("ORDER_NOT_SETTLED");
const expiry=new Date(order.expires_at).getTime();
if(!Number.isFinite(expiry)||expiry>Date.now()-65000)throw Error("EXPIRY_NOT_VERIFIABLE");
const entry=Number(order.entry_price),amount=Number(order.amount_krw);
if(!(entry>0)||!Number.isSafeInteger(amount)||amount<=0||!["UP","DOWN"].includes(order.direction))throw Error("INVALID_STORED_ORDER");
let exit:number,source:string;
if(metalSymbol(order.symbol)){exit=await metalSettlement(order.symbol,expiry);source="TWELVE_DATA_1MIN";}
else{
 if(!cryptoSymbols.has(order.symbol))throw Error("UNSUPPORTED_SYMBOL");
 const start=Math.floor((expiry-1)/60000)*60000-60000;
 const u=new URL("https://data-api.binance.vision/api/v3/klines");
 u.searchParams.set("symbol",order.symbol);u.searchParams.set("interval","1m");u.searchParams.set("startTime",String(start));u.searchParams.set("limit","2");
 const r=await fetch(u,{cache:"no-store",signal:AbortSignal.timeout(6000)});
 if(!r.ok)throw Error("CANDLE_UNAVAILABLE");
 const json:unknown=await r.json();
 if(!Array.isArray(json))throw Error("INVALID_CANDLE");
 const rows=json.filter((x):x is unknown[]=>Array.isArray(x)&&Number(x[6])<=expiry&&Number(x[6])<=Date.now()).sort((a,b)=>Number(b[6])-Number(a[6]));
 const row=rows[0];
 if(!row||expiry-Number(row[6])>60000)throw Error("CANDLE_UNAVAILABLE");
 exit=Number(row[4]);source="BINANCE_VISION_1MIN";
}
if(!Number.isFinite(exit)||exit<=0)throw Error("INVALID_VERIFIED_QUOTE");
const win=order.direction==="UP"?exit>entry:exit<entry;
const result=exit===entry?"DRAW":win?"WIN":"LOSS";
const payout=result==="DRAW"?amount:result==="WIN"?Math.floor(amount*1.95):0;
if(!Number.isSafeInteger(payout))throw Error("INVALID_PAYOUT");
return {result,payout,exit,source,verifiedAt:new Date().toISOString(),expiry:new Date(expiry).toISOString()};
}
