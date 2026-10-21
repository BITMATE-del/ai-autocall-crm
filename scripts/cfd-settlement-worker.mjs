import pg from "pg";
import {randomUUID} from "node:crypto";
const db=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:7000});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const quote=async(symbol,expiry)=>{
 if(symbol==="XAUUSD"){
  const key=process.env.TWELVE_DATA_API_KEY;
  if(!key)throw Error("NO_METAL_KEY");
  if(Date.now()-expiry<75000)throw Error("WAIT_METAL_CANDLE");
  const u=new URL("https://api.twelvedata.com/time_series");
  for(const [k,v] of Object.entries({symbol:"XAU/USD",interval:"1min",timezone:"UTC",start_date:new Date(expiry-240000).toISOString().slice(0,19),end_date:new Date(expiry+60000).toISOString().slice(0,19),outputsize:"10"}))u.searchParams.set(k,v);
  const resp=await fetch(u,{headers:{Authorization:"apikey "+key},signal:AbortSignal.timeout(8500)});
  const j=await resp.json();if(!resp.ok||j.status==="error")throw Error("METAL_FEED_UNAVAILABLE");
  const candles=(j.values||[]).map(x=>({close:Number(x.close),end:Date.parse(x.datetime.replace(" ","T")+"Z")+60000})).filter(x=>x.close>0&&x.end<=expiry);
  candles.sort((a,b)=>b.end-a.end);
  if(!candles[0]||expiry-candles[0].end>120000)throw Error("METAL_CANDLE_MISSING");
  return {price:candles[0].close,source:"TWELVE_DATA_1MIN",priceTime:new Date(candles[0].end)};
 }
 if(!["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","BNBUSDT","DOGEUSDT"].includes(symbol))throw Error("UNSUPPORTED");
 const start=Math.floor((expiry-1)/60000)*60000-60000;
 const u=new URL("https://data-api.binance.vision/api/v3/klines");
 u.searchParams.set("symbol",symbol);u.searchParams.set("interval","1m");u.searchParams.set("startTime",String(start));u.searchParams.set("limit","2");
 const r=await fetch(u,{signal:AbortSignal.timeout(8500)});if(!r.ok)throw Error("COIN_FEED_HTTP");
 const rows=await r.json();
 const candidates=rows.filter(x=>Number(x[6])<=expiry&&Number(x[6])<=Date.now()).sort((a,b)=>Number(b[6])-Number(a[6]));
 const candle=candidates[0];if(!candle||expiry-Number(candle[6])>60000)throw Error("COIN_CANDLE_PENDING");
 return {price:Number(candle[4]),source:"BINANCE_1MIN",priceTime:new Date(Number(candle[6]))};
};
async function settle(item){
 const expiry=Number(item.expiry);
 let q;try{q=await quote(item.symbol,expiry)}catch(e){console.warn("CFD settlement retry",item.id,String(e));return}
 if(!(q.price>0))return;
 const c=await db.connect();
 try{
  await c.query("BEGIN");
  const order=(await c.query("SELECT * FROM km_cfd_orders WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[item.id])).rows[0];
  if(!order){await c.query("ROLLBACK");return}
  const entry=Number(order.entry_price),draw=entry===q.price,win=order.direction==="UP"?q.price>entry:q.price<entry;
  const stake=Number(order.amount_krw),payout=draw?stake:win?Math.floor(stake*1.95):0,result=draw?"DRAW":win?"WIN":"LOSS";
  await c.query("UPDATE km_cfd_orders SET status='SETTLED',result=$2,payout_krw=$3,exit_price=$4,settled_at=NOW(),exit_source=$5,exit_price_time=$6 WHERE id=$1",[item.id,result,payout,q.price,q.source,q.priceTime]);
  if(payout){
   await c.query("UPDATE km_krw_wallets SET balance=balance+$2,updated_at=NOW() WHERE user_id=$1",[order.user_id,payout]);
   await c.query("INSERT INTO km_krw_ledger(id,user_id,order_id,kind,delta_krw) VALUES($1,$2,$3,'CFD_PAYOUT',$4)",[randomUUID(),order.user_id,item.id,payout]);
  }
  await c.query("COMMIT");
  console.log("CFD settled",item.id,result);
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
}
async function run(){
 await db.query("ALTER TABLE km_cfd_orders ADD COLUMN IF NOT EXISTS exit_source TEXT");
 await db.query("ALTER TABLE km_cfd_orders ADD COLUMN IF NOT EXISTS exit_price_time TIMESTAMPTZ");
 console.log("CFD settlement worker started");
 while(true){
  try{
   const pending=await db.query("SELECT id,symbol,EXTRACT(EPOCH FROM expires_at)*1000 AS expiry FROM km_cfd_orders WHERE status='ACTIVE' AND expires_at<=NOW() ORDER BY expires_at LIMIT 30");
   for(const item of pending.rows){try{await settle(item)}catch(e){console.error("CFD settlement failed",item.id,String(e))}}
  }catch(e){console.error("CFD worker unavailable",String(e))}
  await sleep(12000);
 }
}
run().catch(e=>{console.error(e);process.exit(1)});
