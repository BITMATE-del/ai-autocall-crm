import {NextResponse} from "next/server";import {currentUser,database} from "@/lib/auth";import {actorFor,permitted} from "@/lib/org-access";export const dynamic="force-dynamic";const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function GET(){const u=await currentUser();if(!u?.id)return fail("LOGIN_REQUIRED",401);const a=await actorFor(u.id);if(!a?.active||(a.role!=="ADMIN"&&!(await permitted(a,"REFERRAL_MANAGE"))))return fail("FORBIDDEN",403);const r=await database().query("SELECT c.id,c.code,c.status,c.agent_id,c.organization_id,COALESCE(u.username,o.name) username FROM km_referral_codes c LEFT JOIN km_users u ON u.id=c.agent_id JOIN km_organizations o ON o.id=c.organization_id WHERE $1='ADMIN' OR($1 IN ('SUB_HQ','AGENT') AND o.id=$2) ORDER BY c.created_at DESC LIMIT 150",[a.role,a.org]);return NextResponse.json({codes:r.rows},{headers:{"Cache-Control":"no-store"}})}
export async function POST(req:Request){
 const u=await currentUser();if(!u?.id)return fail("LOGIN_REQUIRED",401);
 const a=await actorFor(u.id);if(!a?.active||!["SUB_HQ","AGENT"].includes(a.role)||!(await permitted(a,"REFERRAL_ISSUE")))return fail("FORBIDDEN",403);
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return fail("INVALID_ORIGIN",403);
 const body=await req.json().catch(()=>null);
 // Organization selection is never accepted from a client, including parent organizations.
 if(body?.organizationId||body?.agentId)return fail("SELF_ISSUE_ONLY",403);
 const code=String(body?.code||"").trim().toUpperCase();
 if(!/^[A-Z0-9_-]{4,24}$/.test(code))return fail("INVALID_REFERRAL_CODE",400);
 const c=await database().connect();
 try{await c.query("BEGIN");
 const org=(await c.query("SELECT id,type,status FROM km_organizations WHERE id=$1 FOR SHARE",[a.org])).rows[0];
 if(!org||org.status!=="ACTIVE"||!["SUB_HQ","AGENT"].includes(org.type)){await c.query("ROLLBACK");return fail("INVALID_ORGANIZATION",403)}
 const member=(await c.query("SELECT 1 FROM km_organization_members WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1",[a.org,u.id])).rows[0];
 if(!member){await c.query("ROLLBACK");return fail("ORG_MEMBERSHIP_REQUIRED",403)}
 const duplicate=(await c.query("SELECT 1 FROM km_referral_codes WHERE upper(code)=$1 LIMIT 1",[code])).rowCount;
 if(duplicate){await c.query("ROLLBACK");return fail("CODE_ALREADY_EXISTS",409)}
 await c.query("INSERT INTO km_referral_codes(code,agent_id,organization_id) VALUES($1,$2,$3)",[code,u.id,a.org]);
 await c.query("INSERT INTO km_management_audit_logs(actor_id,target_id,action,after_data) VALUES($1,$2,'REFERRAL_ISSUED',$3::jsonb)",[u.id,a.org,JSON.stringify({code,organizationId:a.org})]);
 await c.query("COMMIT");return NextResponse.json({code},{status:201})
 }catch(e){await c.query("ROLLBACK").catch(()=>{});if((e as {code?:string})?.code==="23505")return fail("CODE_ALREADY_EXISTS",409);console.error("REFERRAL_ISSUE_FAILED",e instanceof Error?e.message:"ERROR");return fail("ISSUE_FAILED",503)}finally{c.release()}
}

export async function PATCH(req:Request){const u=await currentUser();if(!u?.id)return fail("LOGIN_REQUIRED",401);const a=await actorFor(u.id);if(!a?.active||(a.role!=="ADMIN"&&!(await permitted(a,"REFERRAL_MANAGE"))))return fail("FORBIDDEN",403);const origin=req.headers.get("origin");if(!origin||new URL(origin).host!==(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim())return fail("INVALID_ORIGIN",403);const b=await req.json().catch(()=>null),id=String(b?.id||""),status=String(b?.status||"");if(!/^[0-9a-f-]{36}$/i.test(id)||!["ACTIVE","DISABLED"].includes(status))return fail("INVALID_INPUT");const c=await database().connect();try{await c.query("BEGIN");const old=(await c.query("SELECT r.status,r.agent_id,r.organization_id,o.parent_id FROM km_referral_codes r JOIN km_organizations o ON o.id=r.organization_id WHERE r.id=$1 FOR UPDATE OF r",[id])).rows[0];if(!old||a.role==="SUB_HQ"&&old.organization_id!==a.org||a.role==="AGENT"&&old.organization_id!==a.org){await c.query("ROLLBACK");return fail("OUT_OF_SCOPE",403)}await c.query("UPDATE km_referral_codes SET status=$2 WHERE id=$1",[id,status]);await c.query("INSERT INTO km_management_audit_logs(actor_id,action,before_data,after_data) VALUES($1,'REFERRAL_STATUS_CHANGED',$2::jsonb,$3::jsonb)",[a.id,JSON.stringify({id,status:old.status}),JSON.stringify({id,status})]);await c.query("COMMIT");return NextResponse.json({ok:true})}catch{await c.query("ROLLBACK");return fail("UPDATE_FAILED",503)}finally{c.release()}}
