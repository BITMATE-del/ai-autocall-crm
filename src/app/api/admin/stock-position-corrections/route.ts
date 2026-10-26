import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database,isAdmin} from "@/lib/auth";
import {ensurePurchaseCorrectionSchema} from "@/lib/purchase-correction";
export const dynamic="force-dynamic";
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function headquarters(){const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return null;const r=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[u.id]);return r.rows[0]?.role==="SUPER_ADMIN"?u:null}
export async function GET(req:Request){
 const u=await headquarters().catch(()=>null);if(!u)return fail("HEADQUARTERS_ONLY",403);
 const q=(new URL(req.url).searchParams.get("q")||"").slice(0,100);
 try{
 const r=await database().query(`SELECT p.user_id,p.symbol,p.qty,p.cost_krw AS amount,u.username,u.email
 FROM km_stock_positions p JOIN km_users u ON u.id=p.user_id
 WHERE p.qty>0 AND p.symbol ~ '^[0-9]{6}$'
 AND ($1='' OR u.email ILIKE '%'||$1||'%' OR u.username ILIKE '%'||$1||'%' OR u.id::text ILIKE '%'||$1||'%' OR p.symbol ILIKE '%'||$1||'%')
 ORDER BY u.username,p.symbol LIMIT 100`,[q]);
 return NextResponse.json({kind:"STOCK",rows:r.rows.map(x=>({...x,id:x.user_id+":"+x.symbol,status:"HELD"}))},{headers:{"Cache-Control":"no-store"}})
 }catch(e){console.error("STOCK_HOLDINGS_LIST_FAILED",e);return fail("STOCK_HOLDINGS_UNAVAILABLE",503)}
}
type Position={qty:bigint;cost:bigint};
function reconcile(rows:{side:string;qty:string;gross_krw:string;price_krw:string;fee_krw:string;status:string}[]):Position{
 let qty=0n,cost=0n;
 for(const r of rows){
  if(r.status!=="INTERNAL_FILLED"||!["BUY","SELL"].includes(r.side))throw Error("UNVERIFIED_FILL");
  const n=BigInt(r.qty),gross=BigInt(r.gross_krw),price=BigInt(r.price_krw),fee=BigInt(r.fee_krw);
  if(n<=0n||price<=0n||gross!==n*price||fee!==0n)throw Error("FILL_INTEGRITY_MISMATCH");
  if(r.side==="BUY"){qty+=n;cost+=gross}else{
   if(n>qty)throw Error("SELL_EXCEEDS_POSITION");
   const release=n===qty?cost:cost*n/qty;
   qty-=n;cost-=release
  }
 }
 return {qty,cost}
}
export async function POST(req:Request){
 const u=await headquarters().catch(()=>null);if(!u)return fail("HEADQUARTERS_ONLY",403);
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 try{if(!origin||new URL(origin).host!==host)return fail("INVALID_ORIGIN",403)}catch{return fail("INVALID_ORIGIN",403)}
 const b=await req.json().catch(()=>null),id=String(b?.id||""),mode=String(b?.mode||""),target=String(b?.value||"");
 const m=/^([0-9a-f-]{36}):(\d{6})$/i.exec(id);
 if(!m||!uid.test(m[1])||!["QTY","AVG"].includes(mode)||!/^[1-9]\d{0,11}$/.test(target))return fail("INVALID_INPUT");
 const userId=m[1],symbol=m[2],requested=BigInt(target);
 if(requested>100000000000n)return fail("VALUE_TOO_LARGE");
 try{
 await ensurePurchaseCorrectionSchema();
 const c=await database().connect();
 try{
 await c.query("BEGIN");await c.query("SET LOCAL lock_timeout='5000ms'");
 const w=(await c.query("SELECT balance FROM km_krw_wallets WHERE user_id=$1 FOR UPDATE",[userId])).rows[0];
 if(!w){await c.query("ROLLBACK");return fail("WALLET_NOT_FOUND",409)}
 const pos=(await c.query("SELECT qty,cost_krw FROM km_stock_positions WHERE user_id=$1 AND symbol=$2 AND qty>0 FOR UPDATE",[userId,symbol])).rows[0];
 if(!pos){await c.query("ROLLBACK");return fail("HOLDING_NOT_FOUND",409)}
 const fills=await c.query("SELECT id,side,qty,price_krw,gross_krw,fee_krw,status FROM km_stock_internal_orders WHERE user_id=$1 AND symbol=$2 ORDER BY created_at,id FOR SHARE",[userId,symbol]);
 if(!fills.rows.length){await c.query("ROLLBACK");return fail("NO_VERIFIED_ORDER_HISTORY",409)}
 const expected=reconcile(fills.rows);
 if(expected.qty<=0n){await c.query("ROLLBACK");return fail("NO_VERIFIED_HOLDING",409)}
 const oldQty=BigInt(pos.qty),oldCost=BigInt(pos.cost_krw);
 // Only repair an inconsistent materialized position to replayed, documented executions.
 if(mode==="QTY"){
  if(requested!==expected.qty){await c.query("ROLLBACK");return fail("QTY_NOT_SUPPORTED_BY_EXECUTIONS",409)}
  if(oldCost!==expected.cost){await c.query("ROLLBACK");return fail("COST_MISMATCH_REQUIRES_RECONCILIATION",409)}
  if(oldQty===requested){await c.query("ROLLBACK");return fail("NO_CHANGE",409)}
 }else{
  if(oldQty!==expected.qty){await c.query("ROLLBACK");return fail("QTY_MISMATCH_REQUIRES_RECONCILIATION",409)}
  // Exact integer average price is representable only where fill-derived cost divides evenly.
  if(expected.cost%expected.qty!==0n||requested!==expected.cost/expected.qty){await c.query("ROLLBACK");return fail("AVG_NOT_SUPPORTED_BY_EXECUTIONS",409)}
  if(oldCost===expected.cost){await c.query("ROLLBACK");return fail("NO_CHANGE",409)}
 }
 const oldValue=mode==="QTY"?oldQty:oldCost/oldQty,newValue=mode==="QTY"?expected.qty:expected.cost/expected.qty;
 const changeId=randomUUID();
 await c.query("UPDATE km_stock_positions SET qty=$3,cost_krw=$4 WHERE user_id=$1 AND symbol=$2",[userId,symbol,expected.qty.toString(),expected.cost.toString()]);
 await c.query("INSERT INTO km_stock_position_correction_audit(id,user_id,symbol,field,old_value,new_value,old_qty,new_qty,old_cost,new_cost,admin_id,reference_order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",[changeId,userId,symbol,mode,oldValue.toString(),newValue.toString(),oldQty.toString(),expected.qty.toString(),oldCost.toString(),expected.cost.toString(),u.id,fills.rows[fills.rows.length-1].id]);
 await c.query("COMMIT");
 return NextResponse.json({ok:true,mode,oldValue:oldValue.toString(),newValue:newValue.toString(),qty:expected.qty.toString(),cost:expected.cost.toString(),walletUnchanged:true})
 }catch(e){await c.query("ROLLBACK").catch(()=>{});if(e instanceof Error&&/^(UNVERIFIED_FILL|FILL_INTEGRITY_MISMATCH|SELL_EXCEEDS_POSITION)$/.test(e.message))return fail(e.message,409);throw e}finally{c.release()}
 }catch(e){console.error("STOCK_HOLDING_CORRECTION_FAILED",e);return fail("CORRECTION_UNAVAILABLE",503)}
}
