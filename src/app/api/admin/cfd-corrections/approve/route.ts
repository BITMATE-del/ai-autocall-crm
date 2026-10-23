import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database,isAdmin} from "@/lib/auth";
import {verifyCFDOutcome,type OriginalCFD} from "@/lib/cfd-correction-verify";
export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const response=(error:string,status:number)=>NextResponse.json({error},{status});
const enable=()=>process.env.KM_CFD_CORRECTION_APPROVAL_ENABLED==="true";
async function privileged(){const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return null;const r=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[u.id]);return r.rows[0]?.role==="SUPER_ADMIN"?u:null;}
export async function GET(){const u=await privileged().catch(()=>null);if(!u)return response("FORBIDDEN",403);return NextResponse.json({approvalEnabled:enable()},{headers:{"Cache-Control":"no-store"}})}
export async function POST(req:Request){
const u=await privileged().catch(()=>null);if(!u)return response("FORBIDDEN",403);
const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
if(!origin||new URL(origin).host!==host)return response("INVALID_ORIGIN",403);
let b:{requestId?:string;reason?:string;dryRun?:boolean};try{b=await req.json()}catch{return response("INVALID_JSON",400)}
const requestId=String(b.requestId||""),reason=String(b.reason||"").trim();
if(!uuid.test(requestId)||(!b.dryRun&&(reason.length<10||reason.length>2000)))return response("INVALID_INPUT",400);
if(!b.dryRun&&!enable())return response("APPROVAL_DISABLED_UNTIL_VERIFIED_TESTS",503);
try{
 // Approval can be called directly: initialize schema independently of the listing page.
 await database().query("ALTER TABLE km_cfd_correction_requests ADD COLUMN IF NOT EXISTS verified_price NUMERIC(24,10), ADD COLUMN IF NOT EXISTS verified_source TEXT, ADD COLUMN IF NOT EXISTS adjustment_krw BIGINT");
 const preview=await database().query(`SELECT r.id,r.order_id,r.requested_by,r.requested_result,r.status,o.id AS order_uuid,o.symbol,o.direction,o.amount_krw,o.entry_price,o.exit_price,o.result,o.payout_krw,o.status AS order_status,o.expires_at FROM km_cfd_correction_requests r JOIN km_cfd_orders o ON o.id=r.order_id WHERE r.id=$1`,[requestId]);
 const existing=preview.rows[0];if(!existing)return response("REQUEST_NOT_FOUND",404);
 if(existing.status!=="PENDING")return response("REQUEST_NOT_PENDING",409);
 if(!b.dryRun&&existing.requested_by===u.id)return response("DUAL_CONTROL_REQUIRED",403);
 if(existing.requested_result==="VOID")return response("VOID_INCIDENT_VERIFICATION_REQUIRED",409);
 const original:OriginalCFD={id:existing.order_uuid,symbol:existing.symbol,direction:existing.direction,amount_krw:existing.amount_krw,entry_price:existing.entry_price,exit_price:existing.exit_price,result:existing.result,payout_krw:existing.payout_krw,status:existing.order_status,expires_at:existing.expires_at};
 let verified:Awaited<ReturnType<typeof verifyCFDOutcome>>;
 try{verified=await verifyCFDOutcome(original)}catch(e){return response(e instanceof Error?e.message:"REFERENCE_UNAVAILABLE",409)}
 const requested=existing.requested_result;
 if(!b.dryRun&&requested!=="AUTO"&&requested!==verified.result)return response("REQUESTED_RESULT_CONFLICTS_WITH_VERIFIED_MARKET",409);
 const oldPayout=Number(existing.payout_krw||0),delta=verified.payout-oldPayout;
 if(b.dryRun)return NextResponse.json({dryRun:true,canApprove:requested!=="VOID"&&(requested==="AUTO"||requested===verified.result)&&!(delta===0&&verified.result===existing.result),requestId,originalResult:existing.result,verifiedResult:verified.result,originalPayoutKrw:oldPayout,verifiedPayoutKrw:verified.payout,deltaKrw:delta,source:verified.source,verifiedPrice:verified.exit,approvalEnabled:enable(),walletUnchanged:true});
 if(delta===0&&verified.result===existing.result)return response("NO_CORRECTION_NEEDED",409);
 if(!Number.isSafeInteger(delta)||Math.abs(delta)>1000000000)return response("INVALID_SETTLEMENT_DELTA",409);
 const c=await database().connect();try{
 await c.query("BEGIN");
 const r=(await c.query("SELECT * FROM km_cfd_correction_requests WHERE id=$1 FOR UPDATE",[requestId])).rows[0];
 if(!r||r.status!=="PENDING"){await c.query("ROLLBACK");return response("REQUEST_ALREADY_PROCESSED",409)}
 if(r.requested_by===u.id){await c.query("ROLLBACK");return response("DUAL_CONTROL_REQUIRED",403)}
 const o=(await c.query("SELECT * FROM km_cfd_orders WHERE id=$1 FOR UPDATE",[r.order_id])).rows[0];
 if(!o||o.status!=="SETTLED"||String(o.result)!==String(existing.result)||Number(o.payout_krw||0)!==oldPayout||Number(o.entry_price)!==Number(existing.entry_price)||Number(o.exit_price)!==Number(existing.exit_price)){
 await c.query("ROLLBACK");return response("ORDER_CHANGED_REVERIFY_REQUIRED",409)}
 // Lock wallet with a conditional update. Never create negative balances.
 if(delta!==0){const w=await c.query("UPDATE km_krw_wallets SET balance=balance+$2,updated_at=NOW() WHERE user_id=$1 AND balance+$2>=0 RETURNING balance",[o.user_id,delta]);if(!w.rowCount){await c.query("ROLLBACK");return response("INSUFFICIENT_BALANCE_FOR_CORRECTION",409)}}
 await c.query("UPDATE km_cfd_orders SET result=$2,payout_krw=$3,exit_price=$4 WHERE id=$1",[o.id,verified.result,verified.payout,verified.exit]);
 if(delta!==0)await c.query("INSERT INTO km_krw_ledger(id,user_id,order_id,kind,delta_krw) VALUES($1,$2,$3,$4,$5)",[randomUUID(),o.user_id,o.id,"CFD_CORRECTION_"+r.id,delta]);
 await c.query("UPDATE km_cfd_correction_requests SET status='APPROVED',decided_by=$2,decision_reason=$3,decided_at=NOW(),verified_price=$4,verified_source=$5,adjustment_krw=$6 WHERE id=$1",[requestId,u.id,reason,verified.exit,verified.source,delta]);
 await c.query("INSERT INTO km_cfd_correction_audit(id,request_id,actor_id,event,payload) VALUES($1,$2,$3,'VERIFIED_CORRECTION_APPROVED',$4::jsonb)",[randomUUID(),requestId,u.id,JSON.stringify({reason,originalResult:o.result,originalExit:o.exit_price,originalPayout:oldPayout,verifiedResult:verified.result,verifiedExit:verified.exit,verifiedSource:verified.source,verifiedAt:verified.verifiedAt,verifiedExpiry:verified.expiry,newPayout:verified.payout,deltaKrw:delta})]);
 await c.query("COMMIT");return NextResponse.json({ok:true,orderId:o.id,verifiedResult:verified.result,deltaKrw:delta})
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
}catch(e){console.error("CFD_VERIFIED_APPROVAL_FAILED",e);return response("APPROVAL_FAILED",503)}
}
