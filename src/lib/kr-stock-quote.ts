export type KrQuote={symbol:string;price:number;previousClose:number;asOf:string;provider:"NAVER_UNOFFICIAL";marketStatus:string};
export async function getKrStockQuote(symbol:string,forTrade=false):Promise<KrQuote>{
 if(!/^\d{6}$/.test(symbol))throw Error("INVALID_SYMBOL");
 if(forTrade&&process.env.KM_STOCK_INTERNAL_TRADING_ENABLED!=="true")throw Error("STOCK_TRADING_NOT_CONFIGURED");
 const response=await fetch("https://polling.finance.naver.com/api/realtime/domestic/stock/"+symbol,{cache:"no-store",signal:AbortSignal.timeout(6500),headers:{Accept:"application/json"}});
 if(!response.ok)throw Error("QUOTE_PROVIDER_HTTP_"+response.status);
 const json=await response.json();
 const row=json?.datas?.find((d:{itemCode?:string})=>String(d.itemCode)===symbol);
 if(!row)throw Error("QUOTE_SYMBOL_NOT_FOUND");
 const numeric=(x:unknown)=>Number(String(x??"").replace(/,/g,""));
 const price=numeric(row.closePrice),change=numeric(row.compareToPreviousClosePrice);
 const previousClose=price-change;
 if(!Number.isSafeInteger(price)||price<=0||!Number.isSafeInteger(previousClose)||previousClose<=0)throw Error("QUOTE_INVALID_PRICE");
 const raw=String(row.localTradedAt||"");
 const ts=Date.parse(raw),asOf=Number.isFinite(ts)?new Date(ts).toISOString():"";
 const now=Date.now(),kst=new Date(now+9*3600000),weekday=kst.getUTCDay(),minutes=kst.getUTCHours()*60+kst.getUTCMinutes();
 const marketOpen=weekday>=1&&weekday<=5&&minutes>=540&&minutes<930;
 if(forTrade){
  if(!marketOpen)throw Error("MARKET_NOT_TRADABLE");
  if(!asOf||ts>now+5000||now-ts>60000)throw Error("QUOTE_STALE");
 }
 return {symbol,price,previousClose,asOf:asOf||new Date().toISOString(),provider:"NAVER_UNOFFICIAL",marketStatus:marketOpen?"REGULAR_SESSION":"CLOSED"};
}
