import WebSocket from "ws";
import pg from "pg";
const required=["DATABASE_URL","KIS_APP_KEY","KIS_APP_SECRET"];
for(const k of required)if(!process.env[k])throw Error("MISSING_"+k);
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},max:3});
const KIS_WS_URL=process.env.KIS_WS_URL||"ws://ops.koreainvestment.com:21000";
let socket=null,approval="",subscribed=new Set(),retry=1000;
const safe=(s)=>/^\d{6}$/.test(s);
const num=(s)=>{const n=Number(s);return Number.isSafeInteger(n)&&n>=0?n:null};
async function setup(){
 await pool.query(`CREATE TABLE IF NOT EXISTS km_kis_orderbook_live(symbol CHAR(6) PRIMARY KEY,payload JSONB NOT NULL,received_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS km_kis_orderbook_interest(symbol CHAR(6) PRIMARY KEY,last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}
async function getApproval(){
 const r=await fetch("https://openapi.koreainvestment.com:9443/oauth2/Approval",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({grant_type:"client_credentials",appkey:process.env.KIS_APP_KEY,secretkey:process.env.KIS_APP_SECRET}),signal:AbortSignal.timeout(10000)});
 const d=await r.json();if(!r.ok||!d.approval_key)throw Error("KIS_WS_APPROVAL_FAILED");return d.approval_key;
}
function command(symbol,on){if(socket?.readyState!==WebSocket.OPEN)return;socket.send(JSON.stringify({header:{approval_key:approval,custtype:"P",tr_type:on?"1":"2","content-type":"utf-8"},body:{input:{tr_id:"H0STASP0",tr_key:symbol}}}));}
async function reconcile(){
 if(socket?.readyState!==WebSocket.OPEN)return;
 const res=await pool.query("SELECT symbol FROM km_kis_orderbook_interest WHERE last_seen>NOW()-INTERVAL '90 seconds' ORDER BY last_seen DESC LIMIT 35");
 const desired=new Set(res.rows.map(v=>v.symbol.trim()).filter(safe));
 for(const s of subscribed)if(!desired.has(s)){command(s,false);subscribed.delete(s)}
 for(const s of desired)if(!subscribed.has(s)){command(s,true);subscribed.add(s)}
}
async function parseFrame(raw){
 const parts=raw.split("|");if(parts.length<4||parts[0]!=="0"||parts[1]!=="H0STASP0")return;
 const fields=parts[3].split("^"),symbol=fields[0];if(!safe(symbol)||fields.length<43)return;
 // KIS H0STASP0: symbol,time,ask1..10,bid1..10,askQty1..10,bidQty1..10
 const levels=(priceStart,qtyStart)=>Array.from({length:10},(_,i)=>({price:num(fields[priceStart+i]),qty:num(fields[qtyStart+i])})).filter(v=>v.price>0&&v.qty!==null);
 const asks=levels(3,23),bids=levels(13,33);
 if(!asks.length||!bids.length)return;
 await pool.query("INSERT INTO km_kis_orderbook_live(symbol,payload,received_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(symbol) DO UPDATE SET payload=$2::jsonb,received_at=NOW()",[symbol,JSON.stringify({symbol,asks,bids,source:"KIS_WS"})]);
}
async function connect(){
 try{approval=await getApproval();socket=new WebSocket(KIS_WS_URL);socket.on("open",()=>{retry=1000;subscribed.clear();void reconcile()});
 socket.on("message",b=>{const s=b.toString();if(s.startsWith("PINGPONG")){socket?.send(s);return}void parseFrame(s).catch(()=>{})});
 socket.on("error",e=>console.error("KIS_WS",e.message));
 socket.on("close",()=>{subscribed.clear();setTimeout(()=>void connect(),retry);retry=Math.min(30000,retry*2)})}
 catch(e){console.error("KIS_WS_CONNECT",e.message);setTimeout(()=>void connect(),retry);retry=Math.min(30000,retry*2)}
}
await setup();setInterval(()=>void reconcile().catch(e=>console.error("RECONCILE",e.message)),5000);await connect();
process.on("SIGTERM",async()=>{socket?.close();await pool.end();process.exit(0)});
