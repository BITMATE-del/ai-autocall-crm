const mapping:Record<string,string>={XAUUSD:"XAU/USD"};
const freshMs=180000;
export const metalSymbol=(symbol:string)=>mapping[symbol]||null;
async function data(path:string,params:Record<string,string>){const key=process.env.TWELVE_DATA_API_KEY;if(!key)throw Error("FEED_NOT_CONFIGURED");const u=new URL("https://api.twelvedata.com/"+path);for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);const r=await fetch(u,{headers:{"Authorization":"apikey "+key},cache:"no-store",signal:AbortSignal.timeout(7000)});const d=await r.json().catch(()=>null);if(!r.ok)throw Error("FEED_HTTP_"+r.status+(d?.code?"_CODE_"+d.code:""));if(d?.status==="error"||d?.code)throw Error("FEED_RESPONSE_"+(d.code||"ERROR"));return d}
export async function metalCurrent(symbol:string){
 const tv=metalSymbol(symbol);if(!tv)throw Error("UNSUPPORTED_SYMBOL");
 // A quote endpoint may omit a timestamp or return a previous session close.
 // Do not assign today's timestamp to an un-timestamped price.
 const d=await data("time_series",{symbol:tv,interval:"1min",timezone:"UTC",outputsize:"2"});
 const row=Array.isArray(d.values)?d.values[0]:null;
 const at=row?.datetime?Date.parse(String(row.datetime).replace(" ","T")+"Z"):NaN;
 const price=Number(row?.close);
 if(!Number.isFinite(at)||!(price>0))throw Error("MINUTE_BAR_UNAVAILABLE");
 if(at>Date.now()+60000||Date.now()-at>180000)throw Error("STALE_MINUTE_BAR");
 return {price,timestamp:at,source:"TWELVE_DATA_1MIN",symbol:tv};
}
export async function metalSettlement(symbol:string,expiry:number){const tv=metalSymbol(symbol);if(!tv)throw Error("UNSUPPORTED_SYMBOL");if(expiry>Date.now()-65000)throw Error("CANDLE_PENDING");const d=await data("time_series",{symbol:tv,interval:"1min",timezone:"UTC",start_date:new Date(expiry-180000).toISOString().slice(0,19),end_date:new Date(expiry+120000).toISOString().slice(0,19)});const values=Array.isArray(d.values)?d.values:[];const rows=values.map((x:{datetime:string;close:string})=>({at:Date.parse(x.datetime.replace(" ","T")+"Z"),price:Number(x.close)})).filter((x:{at:number;price:number})=>Number.isFinite(x.at)&&x.price>0&&x.at+60000<=expiry);rows.sort((a:{at:number},b:{at:number})=>b.at-a.at);const candidate=rows[0];if(!candidate||expiry-(candidate.at+60000)>120000)throw Error("SETTLEMENT_CANDLE_UNAVAILABLE");return candidate.price}

export async function metalSymbolSearch(term:string){
 const d=await data("symbol_search",{symbol:term,outputsize:"10"});
 const values=Array.isArray(d.data)?d.data:[];
 return values.filter((v:{symbol?:string;instrument_name?:string;type?:string})=>/XAG|SILVER/i.test(String(v.symbol||"")+" "+String(v.instrument_name||""))).slice(0,8).map((v:{symbol?:string;instrument_name?:string;type?:string})=>({symbol:v.symbol,name:v.instrument_name,type:v.type}));
}
