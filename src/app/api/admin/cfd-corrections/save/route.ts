import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database,isAdmin} from "@/lib/auth";
import {verifyCFDOutcome,type OriginalCFD} from "@/lib/cfd-correction-verify";
import {runCFDCorrectionSmoke} from "@/lib/cfd-correction-smoke";
import {ensureCFDCorrectionAuditImmutable} from "@/lib/cfd-correction-audit";
import {ensureIncidentSchema} from "@/lib/cfd-incident";
export const dynamic="force-dynamic";
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(error:string,status:number)=>NextResponse.json({error},{status});
async function privileged(){const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return null;const role=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[u.id]);return role.rows[0]?.role==="SUPER_ADMIN"?u:null}
function originOK(req:Request){const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();try{return !!origin&&new URL(origin).host===host}catch{return false}}
type Body={orderId?:string;result?:string;reason?:string;evidence?:string;dryRun?:boolean};
export async function POST(req:Request){
 const user=await privileged().catch(()=>null);if(!user)return fail("SUPER_ADMIN_REQUIRED",403);
 if(!originOK(req))return fail("INVALID_ORIGIN",403);
 const body:Body=await req.json().catch(()=>({}));const orderId=String(body.orderId||""),requested=String(body.result||""),reason=String(body.reason||"").trim(),evidence=String(body.evidence||"").trim()||"INTERNAL_REVIEW_ONLY",dryRun=body.dryRun===true;
 if(!uid.test(orderId)||!["AUTO","WIN","LOSS","VOID"].includes(requested)||reason.length<10||reason.length>2000||evidence.length>4000)return fail("INVALID_INPUT",400);
 if(!dryRun&&process.env.KM_CFD_CORRECTION_APPROVAL_ENABLED!=="true")return fail("CORRECTION_DISABLED",503);
 try{
  const q=await database().query("SELECT * FROM km_cfd_orders WHERE id=$1",[orderId]);const o=q.rows[0];if(!o)return fail("ORDER_NOT_FOUND",404);
  if(o.status!=="SETTLED")return fail("ORDER_NOT_SETTLED",409);
  const original:OriginalCFD={id:o.id,symbol:o.symbol,direction:o.direction,amount_krw:o.amount_krw,entry_price:o.entry_price,exit_price:o.exit_price,result:o.result,payout_krw:o.payout_krw,status:o.status,expires_at:o.expires_at};
  let verified:Awaited<ReturnType<typeof verifyCFDOutcome>>;
  let incidentId:string|null=null;
  if(requested==="VOID"){
   await ensureIncidentSchema();
   const start=new Date(new Date(o.expires_at).getTime()-Number(o.duration_minutes||3)*60000);
   const proof=await database().query("SELECT id FROM km_cfd_verified_incidents WHERE symbol=$1 AND reviewed_at IS NOT NULL AND start_at<=$2 AND end_at>=$3 ORDER BY reviewed_at DESC LIMIT 1",[o.symbol,start,o.expires_at]);
   incidentId=proof.rows[0]?.id||null;
   if(!incidentId)return fail("VOID_REQUIRES_VERIFIED_SERVER_INCIDENT",409);
   verified={result:"VOID",payout:Number(o.amount_krw),exit:Number(o.exit_price||o.entry_price),source:"VERIFIED_INCIDENT:"+incidentId,verifiedAt:new Date().toISOString(),expiry:new Date(o.expires_at).toISOString()};
  }else{
   try{verified=await verifyCFDOutcome(original)}catch(e){return fail(e instanceof Error?e.message:"REFERENCE_UNAVAILABLE",409)}
  }
  if(requested!=="AUTO"&&requested!==verified.result)return fail("RESULT_CONFLICTS_WITH_VERIFIED_MARKET",409);
  const old=Number(o.payout_krw||0),delta=verified.payout-old;
  if(!Number.isSafeInteger(delta)||Math.abs(delta)>1000000000)return fail("INVALID_DELTA",409);
  if(delta===0&&String(o.result)===verified.result)return fail("NO_CORRECTION_NEEDED",409);
  if(dryRun)return NextResponse.json({ok:true,dryRun:true,originalResult:o.result,newResult:verified.result,oldPayoutKrw:old,newPayoutKrw:verified.payout,deltaKrw:delta,source:verified.source});
  const smoke=await runCFDCorrectionSmoke();if(!smoke.ok)return fail("DB_SAFETY_TEST_FAILED",503);
  await ensureCFDCorrectionAuditImmutable();
  const c=await database().connect();try{
   await c.query("BEGIN");
   const locked=(await c.query("SELECT * FROM km_cfd_orders WHERE id=$1 FOR UPDATE",[orderId])).rows[0];
   if(!locked||locked.status!=="SETTLED"||String(locked.result)!==String(o.result)||Number(locked.payout_krw||0)!==old||Number(locked.entry_price)!==Number(o.entry_price)||Number(locked.exit_price)!==Number(o.exit_price)){
    await c.query("ROLLBACK");return fail("TRADE_CHANGED_RELOAD",409)}
   if(requested==="VOID"){
    const proof=await c.query("SELECT id FROM km_cfd_verified_incidents WHERE id=$1 AND symbol=$2 AND reviewed_at IS NOT NULL AND start_at<=$3 AND end_at>=$4 FOR SHARE",[incidentId,locked.symbol,new Date(new Date(locked.expires_at).getTime()-Number(locked.duration_minutes||3)*60000),locked.expires_at]);
    if(!proof.rowCount){await c.query("ROLLBACK");return fail("SERVER_INCIDENT_CHANGED",409)}
   }
   const pending=await c.query("SELECT 1 FROM km_cfd_correction_requests WHERE order_id=$1 AND status='PENDING' LIMIT 1",[orderId]);
   if(pending.rowCount){await c.query("ROLLBACK");return fail("OLD_PENDING_REQUEST_EXISTS",409)}
   const id=randomUUID();
   await c.query(`INSERT INTO km_cfd_correction_requests(id,user_id,order_id,requested_by,requested_result,reason,evidence,original_result,original_payout_krw,original_exit_price,status,decided_by,decision_reason,decided_at,verified_price,verified_source,adjustment_krw)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'APPROVED',$4,$6,NOW(),$11,$12,$13)`,[id,locked.user_id,orderId,user.id,requested,reason,evidence,o.result,old,o.exit_price,verified.exit,verified.source,delta]);
   if(delta!==0){const w=await c.query("UPDATE km_krw_wallets SET balance=balance+$2,updated_at=NOW() WHERE user_id=$1 AND balance+$2>=0 RETURNING balance",[locked.user_id,delta]);if(!w.rowCount){await c.query("ROLLBACK");return fail("INSUFFICIENT_WALLET_BALANCE",409)}}
   await c.query("UPDATE km_cfd_orders SET result=$2,payout_krw=$3,exit_price=$4 WHERE id=$1",[orderId,verified.result,verified.payout,verified.exit]);
   if(delta!==0)await c.query("INSERT INTO km_krw_ledger(id,user_id,order_id,kind,delta_krw) VALUES($1,$2,$3,$4,$5)",[randomUUID(),locked.user_id,orderId,"CFD_CORRECTION_"+id,delta]);
   await c.query("INSERT INTO km_cfd_correction_audit(id,request_id,actor_id,event,payload) VALUES($1,$2,$3,'VERIFIED_CORRECTION_APPROVED',$4::jsonb)",[randomUUID(),id,user.id,JSON.stringify({directSave:true,reason,evidence,originalResult:o.result,originalPayout:old,verifiedResult:verified.result,verifiedPrice:verified.exit,verifiedSource:verified.source,newPayout:verified.payout,deltaKrw:delta})]);
   await c.query("COMMIT");return NextResponse.json({ok:true,requestId:id,originalResult:o.result,newResult:verified.result,deltaKrw:delta});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
 }catch(e){console.error("CFD_DIRECT_CORRECTION_FAILED",e);return fail("CORRECTION_FAILED",503)}
}
