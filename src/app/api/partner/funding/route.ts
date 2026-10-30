import {snapshotDeposit} from "@/lib/deposit-share";
import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {actorFor,permitted} from "@/lib/org-access";
export const dynamic="force-dynamic";
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
async function access(){const u=await currentUser();if(!u?.id)return null;const a=await actorFor(u.id);return a?.active&&a.role!=="ADMIN"&&a.org&&(await permitted(a,"FUNDING_HISTORY")||await permitted(a,"FUNDING_APPROVE"))?a:null}
async function schema(){await database().query("CREATE TABLE IF NOT EXISTS km_funding_partner_replies(request_id UUID PRIMARY KEY REFERENCES km_funding_requests(id),member_id UUID NOT NULL REFERENCES km_users(id),operator_id UUID NOT NULL REFERENCES km_users(id),message TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())")}
const join="JOIN km_member_attributions ma ON ma.user_id=f.user_id AND (ma.organization_id=$1 OR ($2='SUB_HQ' AND ma.sub_hq_id=$1))";
export async function GET(){const a=await access();if(!a)return fail("FORBIDDEN",403);try{await schema();const r=await database().query(`SELECT f.id,f.kind,f.amount_krw,f.status,f.created_at,u.username,p.message AS partner_reply,p.created_at AS replied_at FROM km_funding_requests f ${join} JOIN km_users u ON u.id=f.user_id LEFT JOIN km_funding_partner_replies p ON p.request_id=f.id ORDER BY (f.status<>'PENDING'),f.created_at DESC LIMIT 200`,[a.org,a.role]);return NextResponse.json({requests:r.rows},{headers:{"Cache-Control":"no-store"}})}catch{return fail("UNAVAILABLE",503)}}
export async function POST(req:Request){const a=await access();if(!a)return fail("FORBIDDEN",403);const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();if(!origin||new URL(origin).host!==host)return fail("INVALID_ORIGIN",403);
 const b=await req.json().catch(()=>null),id=String(b?.id||""),message=String(b?.message||"").trim();if(!/^[0-9a-f-]{36}$/i.test(id)||message.length<2||message.length>1000)return fail("INVALID_INPUT");
 const c=await database().connect();try{await c.query("BEGIN");await c.query("CREATE TABLE IF NOT EXISTS km_funding_partner_replies(request_id UUID PRIMARY KEY REFERENCES km_funding_requests(id),member_id UUID NOT NULL REFERENCES km_users(id),operator_id UUID NOT NULL REFERENCES km_users(id),message TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 const f=(await c.query(`SELECT f.user_id FROM km_funding_requests f ${join} WHERE f.id=$3 FOR SHARE OF f`,[a.org,a.role,id])).rows[0];if(!f){await c.query("ROLLBACK");return fail("OUT_OF_SCOPE",403)}
 const inserted=await c.query("INSERT INTO km_funding_partner_replies(request_id,member_id,operator_id,message) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING request_id",[id,f.user_id,a.id,message]);if(!inserted.rowCount){await c.query("ROLLBACK");return fail("ALREADY_REPLIED",409)}
 await c.query("INSERT INTO km_management_audit_logs(actor_id,target_id,action,after_data) VALUES($1,$2,'FUNDING_MEMBER_REPLIED',$3::jsonb)",[a.id,f.user_id,JSON.stringify({requestId:id})]);await c.query("COMMIT");return NextResponse.json({ok:true,statusUnchanged:true});
 }catch{await c.query("ROLLBACK");return fail("REPLY_FAILED",503)}finally{c.release()}
}

export async function PATCH(req:Request){
 const u=await currentUser();if(!u?.id)return fail("LOGIN_REQUIRED",401);
 const a=await actorFor(u.id);if(!a?.active||a.role==="ADMIN"||!a.org||!(await permitted(a,"FUNDING_APPROVE")))return fail("PERMISSION_DENIED",403);
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return fail("INVALID_ORIGIN",403);
 const b=await req.json().catch(()=>null),id=String(b?.id||""),decision=String(b?.decision||"");
 if(!/^[0-9a-f-]{36}$/i.test(id)||!["APPROVED","REJECTED"].includes(decision))return fail("INVALID_REQUEST",400);
 const c=await database().connect();
 try{
  await c.query("BEGIN");
  const result=await c.query(`SELECT f.* FROM km_funding_requests f
   JOIN km_member_attributions ma ON ma.user_id=f.user_id
   WHERE f.id=$1 AND (ma.organization_id=$2 OR ($3='SUB_HQ' AND ma.sub_hq_id=$2)) FOR UPDATE OF f`,[id,a.org,a.role]);
  const item=result.rows[0];
  if(!item){await c.query("ROLLBACK");return fail("OUT_OF_SCOPE",403)}
  if(item.status!=="PENDING"){await c.query("ROLLBACK");return fail("NOT_PENDING",409)}
  const amount=Number(item.amount_krw);
  if(!Number.isSafeInteger(amount)||amount<=0){await c.query("ROLLBACK");return fail("INVALID_AMOUNT",400)}
  if(decision==="APPROVED"){
   if(item.kind==="DEPOSIT"){
    await c.query("INSERT INTO km_krw_wallets(user_id,balance) VALUES($1,0) ON CONFLICT DO NOTHING",[item.user_id]);
    await c.query("UPDATE km_krw_wallets SET balance=balance+$2,updated_at=NOW() WHERE user_id=$1",[item.user_id,amount]);
    await snapshotDeposit(c,{kind:"KRW",sourceId:item.id,memberId:item.user_id,amount,confirmedAt:new Date(),asset:"KRW",originalAmount:String(amount),exchangeRate:"1"});
   }else if(item.kind==="WITHDRAW"){
    const debit=await c.query("UPDATE km_krw_wallets SET balance=balance-$2,updated_at=NOW() WHERE user_id=$1 AND balance>=$2 RETURNING balance",[item.user_id,amount]);
    if(!debit.rowCount){await c.query("ROLLBACK");return fail("INSUFFICIENT_BALANCE",409)}
   }else{await c.query("ROLLBACK");return fail("INVALID_KIND",400)}
   await c.query("INSERT INTO km_krw_ledger(id,user_id,kind,delta_krw) VALUES($1,$2,$3,$4)",[randomUUID(),item.user_id,item.kind==="DEPOSIT"?"MANUAL_DEPOSIT":"MANUAL_WITHDRAW",item.kind==="DEPOSIT"?amount:-amount]);
  }
  await c.query("UPDATE km_funding_requests SET status=$2,reviewed_at=NOW(),reviewed_by=$3 WHERE id=$1",[id,decision,u.id]);
  await c.query("INSERT INTO km_management_audit_logs(actor_id,target_id,action,after_data) VALUES($1,$2,'PARTNER_FUNDING_REVIEW',$3::jsonb)",[u.id,item.user_id,JSON.stringify({requestId:id,decision,kind:item.kind,amount,organizationId:a.org})]);
  await c.query("COMMIT");return NextResponse.json({ok:true});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});console.error("PARTNER_FUNDING_REVIEW_FAILED",e instanceof Error?e.message:"ERROR");return fail("REVIEW_FAILED",503)}finally{c.release()}
}
