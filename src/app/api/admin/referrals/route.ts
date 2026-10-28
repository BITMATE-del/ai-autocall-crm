import {NextResponse} from "next/server";import {randomBytes} from "node:crypto";import {currentUser,database} from "@/lib/auth";import {actorFor,permitted} from "@/lib/org-access";export const dynamic="force-dynamic";const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function GET(){const u=await currentUser();if(!u?.id)return fail("LOGIN_REQUIRED",401);const a=await actorFor(u.id);if(!a?.active||(a.role!=="ADMIN"&&!(await permitted(a,"REFERRAL_MANAGE"))))return fail("FORBIDDEN",403);const r=await database().query("SELECT c.id,c.code,c.status,c.agent_id,c.organization_id,COALESCE(u.username,o.name) username FROM km_referral_codes c LEFT JOIN km_users u ON u.id=c.agent_id JOIN km_organizations o ON o.id=c.organization_id WHERE $1='ADMIN' OR($1='SUB_HQ' AND (o.id=$2 OR o.parent_id=$2)) OR($1='AGENT' AND o.id=$2) ORDER BY c.created_at DESC LIMIT 150",[a.role,a.org]);return NextResponse.json({codes:r.rows},{headers:{"Cache-Control":"no-store"}})}
export async function POST(req:Request){
 const u=await currentUser();if(!u?.id)return fail("LOGIN_REQUIRED",401);
 const a=await actorFor(u.id);if(!a?.active||a.role!=="ADMIN"&&!(await permitted(a,"REFERRAL_ISSUE")))return fail("FORBIDDEN",403);
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return fail("INVALID_ORIGIN",403);
 const body=await req.json().catch(()=>null);
 const requested=String(body?.organizationId||"");
 const id=a.role==="ADMIN"?requested:a.role==="SUB_HQ"?(requested||a.org):a.org;
 if(!id||!/^[0-9a-f-]{36}$/i.test(id))return fail("INVALID_INPUT");
 const c=await database().connect();
 try{await c.query("BEGIN");
 const org=(await c.query("SELECT id,type,parent_id,status FROM km_organizations WHERE id=$1 FOR SHARE",[id])).rows[0];
 if(!org||org.status!=="ACTIVE"||org.type==="HQ"){await c.query("ROLLBACK");return fail("INVALID_ORGANIZATION",403)}
 if(a.role==="SUB_HQ"&&id!==a.org&&!(org.type==="AGENT"&&org.parent_id===a.org)){await c.query("ROLLBACK");return fail("OUT_OF_SCOPE",403)}
 if(a.role==="AGENT"&&id!==a.org){await c.query("ROLLBACK");return fail("OUT_OF_SCOPE",403)}
 const owner=(await c.query("SELECT user_id FROM km_organization_members WHERE organization_id=$1 AND status='ACTIVE' LIMIT 1",[id])).rows[0]?.user_id;
 if(!owner){await c.query("ROLLBACK");return fail("AGENT_NOT_ALLOWED",403)}
 const code="HF"+randomBytes(6).toString("hex").toUpperCase();
 await c.query("INSERT INTO km_referral_codes(code,agent_id,organization_id) VALUES($1,$2,$3)",[code,owner,id]);
 await c.query("INSERT INTO km_management_audit_logs(actor_id,target_id,action,after_data) VALUES($1,$2,'REFERRAL_ISSUED',$3::jsonb)",[a.id,id,JSON.stringify({code,organizationId:id})]);
 await c.query("COMMIT");return NextResponse.json({code},{status:201})
 }catch(e){await c.query("ROLLBACK");console.error("REFERRAL_ISSUE_FAILED",e instanceof Error?e.message:e);return fail("ISSUE_FAILED",503)}finally{c.release()}
}

export async function PATCH(req:Request){const u=await currentUser();if(!u?.id)return fail("LOGIN_REQUIRED",401);const a=await actorFor(u.id);if(!a?.active||(a.role!=="ADMIN"&&!(await permitted(a,"REFERRAL_MANAGE"))))return fail("FORBIDDEN",403);const origin=req.headers.get("origin");if(!origin||new URL(origin).host!==(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim())return fail("INVALID_ORIGIN",403);const b=await req.json().catch(()=>null),id=String(b?.id||""),status=String(b?.status||"");if(!/^[0-9a-f-]{36}$/i.test(id)||!["ACTIVE","DISABLED"].includes(status))return fail("INVALID_INPUT");const c=await database().connect();try{await c.query("BEGIN");const old=(await c.query("SELECT r.status,r.agent_id,r.organization_id,o.parent_id FROM km_referral_codes r JOIN km_organizations o ON o.id=r.organization_id WHERE r.id=$1 FOR UPDATE OF r",[id])).rows[0];if(!old||a.role==="SUB_HQ"&&old.parent_id!==a.org&&old.organization_id!==a.org||a.role==="AGENT"&&old.organization_id!==a.org){await c.query("ROLLBACK");return fail("OUT_OF_SCOPE",403)}await c.query("UPDATE km_referral_codes SET status=$2 WHERE id=$1",[id,status]);await c.query("INSERT INTO km_management_audit_logs(actor_id,action,before_data,after_data) VALUES($1,'REFERRAL_STATUS_CHANGED',$2::jsonb,$3::jsonb)",[a.id,JSON.stringify({id,status:old.status}),JSON.stringify({id,status})]);await c.query("COMMIT");return NextResponse.json({ok:true})}catch{await c.query("ROLLBACK");return fail("UPDATE_FAILED",503)}finally{c.release()}}
