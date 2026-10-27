export type KrQuote={symbol:string;price:number;previousClose:number;asOf:string;provider:"NAVER_UNOFFICIAL"|"KIS_REST";marketStatus:string};
export async function getKrStockQuote(symbol:string,forTrade=false):Promise<KrQuote>{
 if(!/^\d{6}$/.test(symbol))throw Error("INVALID_SYMBOL");
 // Opt-in for read-only display quotes. Keep existing trusted trade pricing unchanged.
 if(!forTrade&&process.env.KM_STOCK_QUOTE_PROVIDER==="KIS"){
  try{const {getKisStockQuote}=await import("@/lib/kis-stock-quote");return await getKisStockQuote(symbol)}
  catch(e){console.warn("KIS_DISPLAY_QUOTE_FALLBACK",e instanceof Error?e.message:"KIS_ERROR")}
 }

 if(forTrade&&process.env.KM_STOCK_INTERNAL_TRADING_ENABLED!=="true")throw Error("STOCK_TRADING_NOT_CONFIGURED");
 const numeric=(x:unknown)=>Number(String(x??"").replace(/,/g,""));
 let price=NaN,previousClose=NaN,raw="";
 const errors:string[]=[];
 try{
  const response=await fetch("https://polling.finance.naver.com/api/realtime/domestic/stock/"+symbol,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{Accept:"application/json","User-Agent":"Mozilla/5.0"}});
  if(!response.ok)throw Error("PRIMARY_HTTP_"+response.status);
  const json=await response.json();
  const row=json?.datas?.find((d:{itemCode?:string})=>String(d.itemCode)===symbol);
  if(!row)throw Error("PRIMARY_EMPTY");
  price=numeric(row.closePrice);
  const change=numeric(row.compareToPreviousClosePrice);
  previousClose=price-change;
  raw=String(row.localTradedAt||"");
  if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(previousClose)||previousClose<=0)throw Error("PRIMARY_INVALID_PRICE");
 }catch(e){errors.push(e instanceof Error?e.message:"PRIMARY_ERROR");price=NaN}
 if(!(price>0)){
  const url="https://polling.finance.naver.com/api/realtime?query="+encodeURIComponent("SERVICE_ITEM:"+symbol);
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{Accept:"application/json","User-Agent":"Mozilla/5.0"}});
  if(!response.ok)throw Error("QUOTE_PROVIDER_HTTP_"+response.status+"_"+errors.join(","));
  const json=await response.json();
  const row=json?.result?.areas?.flatMap((a:{datas?:unknown[]})=>a.datas||[]).find((d:any)=>String(d?.cd)===symbol);
  if(!row)throw Error("QUOTE_SYMBOL_NOT_FOUND");
  price=numeric(row.nv);previousClose=numeric(row.sv);
  if(!(previousClose>0))previousClose=price-numeric(row.cv);
  raw=String(row.localTradedAt||row.tradedAt||"");
  if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(previousClose)||previousClose<=0)throw Error("QUOTE_INVALID_PRICE");
 }
 const ts=Date.parse(raw),asOf=Number.isFinite(ts)?new Date(ts).toISOString():"";
 const now=Date.now(),kst=new Date(now+9*3600000),weekday=kst.getUTCDay(),minutes=kst.getUTCHours()*60+kst.getUTCMinutes();
 const marketOpen=weekday>=1&&weekday<=5&&minutes>=540&&minutes<930;
 if(forTrade){
  if(!marketOpen)throw Error("MARKET_NOT_TRADABLE");
  if(!asOf||ts>now+5000||now-ts>60000)throw Error("QUOTE_STALE");
 }
 return {symbol,price,previousClose,asOf:asOf||new Date().toISOString(),provider:"NAVER_UNOFFICIAL",marketStatus:marketOpen?"REGULAR_SESSION":"CLOSED"};
}
