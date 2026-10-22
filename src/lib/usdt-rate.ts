/** Live USDT/KRW market quote. Google Finance is display-only and has no supported server quote API.
 * Uses CoinGecko Tether/KRW price, short-lived cache; never invents a rate on outages.
 */
type Quote={krwPerUsdt:number;source:string;asOf:string};
let cache:{quote:Quote;until:number}|undefined;
export async function getUsdtKrwQuote():Promise<Quote>{
 if(cache&&Date.now()<cache.until)return cache.quote;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5500);
 try{
  const res=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=krw&include_last_updated_at=true",{cache:"no-store",signal:controller.signal,headers:{"Accept":"application/json"}});
  if(!res.ok)throw Error("USDT_RATE_UNAVAILABLE");
  const json=await res.json();const val=Number(json?.tether?.krw),updated=Number(json?.tether?.last_updated_at);
  if(!Number.isFinite(val)||val<100||val>10000||!updated||Date.now()-updated*1000>300000||updated*1000>Date.now()+30000)throw Error("USDT_RATE_STALE");
  const quote={krwPerUsdt:Math.round(val),source:"CoinGecko USDT/KRW",asOf:new Date(updated*1000).toISOString()};
  cache={quote,until:Date.now()+30000};return quote;
 }finally{clearTimeout(timer)}
}
