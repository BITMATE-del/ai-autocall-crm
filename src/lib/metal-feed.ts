const mapping:Record<string,string>={XAUUSD:"XAU/USD"};
const freshMs=180000;
export const metalSymbol=(symbol:string)=>mapping[symbol]||null;
async function data(path:string,params:Record<string,string>){const key=process.env.TWELVE_DATA_API_KEY;if(!key)throw Error("FEED_NOT_CONFIGURED");const u=new URL("https://api.twelvedata.com/"+path);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);const r=await fetch(u,{headers:{"Authorization":"apikey "+key},cache:"no-store",signal:AbortSignal.timeout(7000)});const d=await r.json().catch(()=>null);if(!r.ok)throw Error("FEED_HTTP_"+r.status+(d?.code?"_CODE_"+d.code:""));if(d?.status==="error"||d?.code)throw Error("FEED_RESPONSE_"+(d.code||"ERROR"));return d}
type MetalCandle={at:number;close:number};
export async function metalCandles(symbol:string,start:number,end:number):Promise<MetalCandle[]>{
 const tv=metalSymbol(symbol);if(!tv)throw Error("UNSUPPORTED_SYMBOL");
 const fmt=(t:number)=>new Date(t).toISOString().slice(0,19);
 const nearNow=end>=Date.now()-90000;
 const params=nearNow?{symbol:tv,interval:"1min",timezone:"UTC",outputsize:"30"}:{symbol:tv,interval:"1min",timezone:"UTC",start_date:fmt(start),end_date:fmt(end)};
 const d=await data("time_series",params);
 if(!Array.isArray(d.values))throw Error("MINUTE_SERIES_UNAVAILABLE");
 return d.values.map((v:{datetime?:string;close?:string})=>({
  at:Date.parse(String(v.datetime||"").replace(" ","T")+"Z"),
  close:Number(v.close)
 })).filter((x:MetalCandle)=>Number.isFinite(x.at)&&Number.isFinite(x.close)&&x.close>0)
  .sort((a:MetalCandle,b:MetalCandle)=>b.at-a.at);
}
export async function metalCurrent(symbol:string){
 const now=Date.now();
 const bars=await metalCandles(symbol,now-12*60000,now);
 // Use only completed 1-minute bars and never treat chart quotes as executable prices.
 const bar=bars.find(x=>x.at+60000<=now);
 if(!bar)throw Error("MINUTE_BAR_UNAVAILABLE");
 if(now-(bar.at+60000)>freshMs)throw Error("STALE_MINUTE_BAR");
 return {price:bar.close,timestamp:bar.at+60000,source:"TWELVE_DATA_1MIN_CLOSED",symbol:metalSymbol(symbol)};
}
export async function metalSettlement(symbol:string,expiry:number){
 if(expiry>Date.now()-65000)throw Error("CANDLE_PENDING");
 let bars:MetalCandle[];
 try{bars=await metalCandles(symbol,expiry-6*60000,expiry)}catch(e){if(Date.now()-expiry>20*60000)throw e;bars=await metalCandles(symbol,Date.now()-30*60000,Date.now())}
 const bar=bars.find(x=>x.at+60000<=expiry);
 if(!bar||expiry-(bar.at+60000)>120000)throw Error("SETTLEMENT_CANDLE_UNAVAILABLE");
 return bar.close;
}

export async function metalSymbolSearch(term:string){
 const d=await data("symbol_search",{symbol:term,outputsize:"10"});
 const values=Array.isArray(d.data)?d.data:[];
 return values.filter((v:{symbol?:string;instrument_name?:string;type?:string})=>/XAG|SILVER/i.test(String(v.symbol||"")+" "+String(v.instrument_name||""))).slice(0,8).map((v:{symbol?:string;instrument_name?:string;type?:string})=>({symbol:v.symbol,name:v.instrument_name,type:v.type}));
}
