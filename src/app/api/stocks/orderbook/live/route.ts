import {experimental_upgradeWebSocket} from "@vercel/functions";
import WebSocket from "ws";
import {randomUUID} from "node:crypto";
import {database,currentUser} from "@/lib/auth";
export const dynamic="force-dynamic";
export const maxDuration=300;
const db=database;
const SYMBOL=/^\\d{6}$/;
const KIS_URL="ws://ops.koreainvestment.com:21000";
const key="hfm-kis-marketdata";
const n=(v:string)=>{const x=Number(v);return Number.isSafeInteger(x)&&x>=0?x:null};
let setup:Promise<void>|null=null;
function prepare(){return setup??(setup=db().query("CREATE TABLE IF NOT EXISTS km_kis_live_leases(name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL)").then(()=>db().query("CREATE TABLE IF NOT EXISTS km_kis_live_books(symbol CHAR(6) PRIMARY KEY,payload JSONB NOT NULL,received_at TIMESTAMPTZ NOT NULL DEFAULT NOW())")).then(()=>{}).catch(e=>{setup=null;throw e}))}
async function lease(owner:string){const z=await db().query("INSERT INTO km_kis_live_leases(name,owner,expires_at) VALUES($1,$2,NOW()+INTERVAL '12 seconds') ON CONFLICT(name) DO UPDATE SET owner=$2,expires_at=NOW()+INTERVAL '12 seconds' WHERE km_kis_live_leases.expires_at<NOW() OR km_kis_live_leases.owner=$2 RETURNING owner",[key,owner]);return z.rowCount===1}
async function approval(){const resp=await fetch("https://openapi.koreainvestment.com:9443/oauth2/Approval",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({grant_type:"client_credentials",appkey:process.env.KIS_APP_KEY,secretkey:process.env.KIS_APP_SECRET}),signal:AbortSignal.timeout(9000)});if(!resp.ok)throw Error("KIS_APPROVAL_FAILED");const j=await resp.json();if(!j.approval_key)throw Error("KIS_APPROVAL_MISSING");return j.approval_key as string}
async function latest(symbol:string){const r=await db().query("SELECT payload FROM km_kis_live_books WHERE symbol=$1 AND received_at>NOW()-INTERVAL '8 seconds'",[symbol]);return r.rows[0]?.payload??null}
function parse(v:string,symbol:string){const a=v.split("|");if(a[0]!=="0"||a[1]!=="H0STASP0"||!a[3])return null;const f=a[3].split("^");if(f[0]!==symbol||f.length<43)return null;const levels=(p:number,q:number)=>Array.from({length:10},(_,i)=>({price:n(f[p+i]),qty:n(f[q+i])})).filter(x=>x.price!==null&&x.price>0&&x.qty!==null);const asks=levels(3,23),bids=levels(13,33);if(!asks.length||!bids.length)return null;return {symbol,market:"KRX",asks,bids,totalAsk:asks.reduce((a,x)=>a+(x.qty??0),0),totalBid:bids.reduce((a,x)=>a+(x.qty??0),0),asOf:new Date().toISOString(),source:"KIS_WS"}}
export async function GET(request:Request){
 const url=new URL(request.url),symbol=url.searchParams.get("symbol")||"";
 if(!SYMBOL.test(symbol))return new Response("INVALID_SYMBOL",{status:400});
 const user=await currentUser();if(!user)return new Response("UNAUTHORIZED",{status:401});
 if(!process.env.KIS_APP_KEY||!process.env.KIS_APP_SECRET)return new Response("UNAVAILABLE",{status:503});
 return experimental_upgradeWebSocket((client)=>{
 const owner=randomUUID();let closed=false,upstream:WebSocket|null=null,owns=false,poll:ReturnType<typeof setInterval>|null=null,renew:ReturnType<typeof setInterval>|null=null,last="";
 const send=(payload:unknown)=>{try{client.send(JSON.stringify(payload))}catch{}};
 const stop=()=>{closed=true;if(poll)clearInterval(poll);if(renew)clearInterval(renew);upstream?.close();if(owns)void db().query("DELETE FROM km_kis_live_leases WHERE name=$1 AND owner=$2",[key,owner]).catch(()=>{})};
 client.on("close",stop);
 const start=async()=>{try{
 await prepare();owns=await lease(owner);
 if(owns){const token=await approval();if(closed)return;upstream=new WebSocket(KIS_URL);upstream.on("open",()=>{upstream?.send(JSON.stringify({header:{approval_key:token,custtype:"P",tr_type:"1","content-type":"utf-8"},body:{input:{tr_id:"H0STASP0",tr_key:symbol}}}))});upstream.on("message",(raw)=>{const t=raw.toString();if(t.startsWith("PINGPONG")){upstream?.send(t);return}const data=parse(t,symbol);if(data){send(data);void db().query("INSERT INTO km_kis_live_books(symbol,payload,received_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(symbol) DO UPDATE SET payload=$2::jsonb,received_at=NOW()",[symbol,JSON.stringify(data)]).catch(()=>{})}});upstream.on("error",()=>{});upstream.on("close",()=>{if(!closed)send({type:"reconnect"})});
 renew=setInterval(()=>void lease(owner).then(ok=>{if(!ok){owns=false;upstream?.close()}}).catch(()=>{owns=false;upstream?.close()}),5000);
 }
 poll=setInterval(()=>{void latest(symbol).then(data=>{if(!closed&&data&&data.asOf!==last){last=data.asOf;send(data)}}).catch(()=>{})},1000);
 }catch{send({type:"fallback"});stop()}};
 void start();
 });
}
