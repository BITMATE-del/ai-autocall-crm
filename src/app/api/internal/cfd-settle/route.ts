import {ensureCFDActiveOverrides,getActiveSettlementDecision} from "@/lib/cfd-active-overrides";
import {NextResponse} from "next/server";
import {randomUUID,timingSafeEqual} from "node:crypto";
import {database} from "@/lib/auth";
import {verifyCFDOutcome,type OriginalCFD} from "@/lib/cfd-correction-verify";
export const dynamic="force-dynamic";
export const maxDuration=60;
function authorized(header:string|null){const secret=process.env.CRON_SECRET;if(!secret||secret.length<24||!header?.startsWith("Bearer "))return false;const a=Buffer.from(header.slice(7)),b=Buffer.from(secret);return a.length===b.length&&timingSafeEqual(a,b)}
export async function GET(req:Request){
if(!authorized(req.headers.get("authorization")))return NextResponse.json({error:"FORBIDDEN"},{status:403});
if(process.env.KM_SERVICE_MODE==="admin"||process.env.KM_CFD_SETTLEMENT_WORKER_ENABLED!=="true")return NextResponse.json({error:"WORKER_DISABLED"},{status:503});
let settled=0,skipped=0,failed=0;
await ensureCFDActiveOverrides();
try{
const r=await database().query("SELECT id,user_id,symbol,direction,amount_krw,entry_price,exit_price,result,payout_krw,status,expires_at FROM km_cfd_orders WHERE status='ACTIVE' AND expires_at<=NOW() ORDER BY expires_at,id LIMIT 8");
for(const o of r.rows){try{
 const valid=await verifyCFDOutcome(o as OriginalCFD);
 const c=await database().connect();
 try{await c.query("BEGIN");
 const claim=(await c.query("SELECT * FROM km_cfd_orders WHERE id=$1 FOR UPDATE",[o.id])).rows[0];
 if(!claim||claim.status!=="ACTIVE"){await c.query("ROLLBACK");skipped++;continue}
 if(Number(claim.entry_price)!==Number(o.entry_price)||claim.direction!==o.direction||Number(claim.amount_krw)!==Number(o.amount_krw)){await c.query("ROLLBACK");skipped++;continue}
 const decision=await getActiveSettlementDecision(c,claim,valid);
if(decision.applied!=="AUTO"){
 await c.query("INSERT INTO km_cfd_override_audit(id,order_id,admin_id,previous_value,new_value,reason) SELECT $1,$2,v.admin_id,$3,$4,$5 FROM km_cfd_active_overrides v WHERE v.order_id=$2",[randomUUID(),claim.id,decision.result,decision.applied,"SETTLEMENT_APPLIED | MARKET="+(valid).result+" | REASON="+(decision.overrideReason||"VERIFIED_INCIDENT")]);
 }

 await c.query("UPDATE km_cfd_orders SET status='SETTLED',result=$2,payout_krw=$3,exit_price=$4,settled_at=NOW() WHERE id=$1",[claim.id,decision.result,decision.payout,valid.exit]);
 if(decision.payout>0){const wallet=await c.query("UPDATE km_krw_wallets SET balance=balance+$2,updated_at=NOW() WHERE user_id=$1 RETURNING balance",[claim.user_id,decision.payout]);if(!wallet.rowCount)throw Error("WALLET_MISSING");
 await c.query("INSERT INTO km_krw_ledger(id,user_id,order_id,kind,delta_krw) VALUES($1,$2,$3,'CFD_PAYOUT',$4)",[randomUUID(),claim.user_id,claim.id,decision.payout])}
 await c.query("COMMIT");settled++}
 catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
}catch(e){failed++;console.error("CFD_CRON_SETTLEMENT_RETRY",{orderId:o.id,error:e instanceof Error?e.message:String(e)})}}
return NextResponse.json({ok:true,settled,skipped,failed},{headers:{"Cache-Control":"no-store"}})
}catch(e){console.error("CFD_CRON_UNAVAILABLE",e);return NextResponse.json({error:"SETTLEMENT_WORKER_UNAVAILABLE"},{status:503})}}
