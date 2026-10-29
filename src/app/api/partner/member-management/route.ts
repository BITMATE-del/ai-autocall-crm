import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database} from "@/lib/auth";
import {actorFor,memberInScope,permitted} from "@/lib/org-access";
import {ensureRestrictions,restrictionFields} from "@/lib/member-restrictions";
export const dynamic="force-dynamic";
const deny=(error:string,status=403)=>NextResponse.json({error},{status});
const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export async function POST(req:Request){
 const user=await currentUser();if(!user?.id)return deny("LOGIN_REQUIRED",401);
 const actor=await actorFor(user.id);
 if(!actor?.active||actor.role==="ADMIN"||!actor.org)return deny("FORBIDDEN");
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return deny("INVALID_ORIGIN");
 const body=await req.json().catch(()=>null);
 const memberId=String(body?.memberId||""),action=String(body?.action||"");
 const operationId=String(body?.operationId||"");
 if(!uuid(memberId)||memberId===user.id||!uuid(operationId)||!["BALANCE","RESTRICTIONS"].includes(action))return deny("INVALID_INPUT",400);
 if(!(await memberInScope(actor,memberId)))return deny("OUT_OF_SCOPE");
 const permission=action==="BALANCE"?"MEMBER_BALANCE_ADJUST":null;
 if(permission&&!(await permitted(actor,permission)))return deny("PERMISSION_DENIED");
 if(action==="RESTRICTIONS"){
   const selected=body?.restrictions;
   if(!selected||typeof selected!=="object"||restrictionFields.some(k=>typeof selected[k]!=="boolean")||Object.keys(selected).some(k=>!restrictionFields.includes(k as typeof restrictionFields[number])))return deny("INVALID_RESTRICTIONS",400);
   const [canFreeze,canUnfreeze]=await Promise.all([permitted(actor,"MEMBER_FREEZE"),permitted(actor,"MEMBER_UNFREEZE")]);
   if(!canFreeze&&!canUnfreeze)return deny("PERMISSION_DENIED");
 }
 const amount=body?.amount,reason=String(body?.reason||"").trim();
 if(action==="BALANCE"&&(!Number.isSafeInteger(amount)||amount===0||Math.abs(amount)>100000000))return deny("INVALID_AMOUNT",400);
 // Deliberately no free-form amount reasons required. Operation identifiers and audit ledger ensure accountability.
 await ensureRestrictions();
 const c=await database().connect();
 try{
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",[memberId]);
  const owned=(await c.query("SELECT 1 FROM km_member_attributions WHERE user_id=$1 AND (organization_id=$2 OR ($3='SUB_HQ' AND sub_hq_id=$2))",[memberId,actor.org,actor.role])).rowCount;
  if(!owned){await c.query("ROLLBACK");return deny("OUT_OF_SCOPE")}
  if((await c.query("SELECT 1 FROM km_admin_roles WHERE user_id=$1",[memberId])).rowCount){await c.query("ROLLBACK");return deny("ADMIN_TARGET_DENIED")}
  const existing=await c.query("SELECT 1 FROM km_management_audit_logs WHERE actor_id=$1 AND target_id=$2 AND after_data->>'operationId'=$3 LIMIT 1",[user.id,memberId,operationId]);
  if(existing.rowCount){await c.query("COMMIT");return NextResponse.json({ok:true,alreadyProcessed:true})}
  let detail:Record<string,unknown>={operationId,organizationId:actor.org};
  if(action==="BALANCE"){
   await c.query("INSERT INTO km_krw_wallets(user_id,balance) VALUES($1,0) ON CONFLICT(user_id) DO NOTHING",[memberId]);
   const row=(await c.query("SELECT balance FROM km_krw_wallets WHERE user_id=$1 FOR UPDATE",[memberId])).rows[0];
   const before=Number(row.balance),after=before+amount;
   if(!Number.isSafeInteger(after)||after<0){await c.query("ROLLBACK");return deny("INSUFFICIENT_BALANCE",409)}
   await c.query("UPDATE km_krw_wallets SET balance=$2,updated_at=NOW() WHERE user_id=$1",[memberId,after]);
   await c.query("INSERT INTO km_krw_ledger(id,user_id,kind,delta_krw) VALUES($1,$2,'ADMIN_ADJUSTMENT',$3)",[operationId,memberId,amount]);
   detail={...detail,before,after,amount};
  }else{
   const selected=body.restrictions as Record<string,boolean>;
   const old=(await c.query("SELECT stock_trading_blocked,cfd_trading_blocked,deposits_withdrawals_blocked,login_blocked FROM km_member_restrictions WHERE user_id=$1 FOR UPDATE",[memberId])).rows[0]||{stock_trading_blocked:false,cfd_trading_blocked:false,deposits_withdrawals_blocked:false,login_blocked:false};
   const changed=restrictionFields.filter(key=>Boolean(old[key])!==selected[key]);
   const canFreeze=await permitted(actor,"MEMBER_FREEZE"),canUnfreeze=await permitted(actor,"MEMBER_UNFREEZE");
   if(changed.some(k=>selected[k]&&!canFreeze||!selected[k]&&!canUnfreeze)){await c.query("ROLLBACK");return deny("PERMISSION_DENIED")}
   await c.query(`INSERT INTO km_member_restrictions(user_id,stock_trading_blocked,cfd_trading_blocked,deposits_withdrawals_blocked,login_blocked,updated_by)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET
    stock_trading_blocked=$2,cfd_trading_blocked=$3,deposits_withdrawals_blocked=$4,login_blocked=$5,updated_by=$6,updated_at=NOW()`,
    [memberId,selected.stock_trading_blocked,selected.cfd_trading_blocked,selected.deposits_withdrawals_blocked,selected.login_blocked,user.id]);
   await c.query("INSERT INTO km_member_restriction_logs(id,user_id,admin_id,previous_state,new_state,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)",[operationId,memberId,user.id,JSON.stringify(old),JSON.stringify(selected),reason||"소속 회원 권한 관리"]);
   detail={...detail,before:old,after:selected};
  }
  await c.query("INSERT INTO km_management_audit_logs(actor_id,target_id,action,after_data) VALUES($1,$2,$3,$4::jsonb)",[user.id,memberId,"PARTNER_MEMBER_"+action,JSON.stringify(detail)]);
  await c.query("COMMIT");
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});console.error("PARTNER_MEMBER_ACTION_FAILED",e instanceof Error?e.message:"ERROR");return deny("ACTION_FAILED",503)}finally{c.release()}
}
