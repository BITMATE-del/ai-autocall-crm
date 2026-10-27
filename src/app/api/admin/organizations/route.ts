import {NextResponse} from "next/server";
import bcrypt from "bcryptjs";
import {currentUser,database} from "@/lib/auth";
import {actorFor,grantsFor,permitted,PERMISSIONS,AGENT_PERMISSIONS} from "@/lib/org-access";
export const dynamic="force-dynamic";
const ROOT="00000000-0000-4000-8000-000000000001";
function error(message:string,status=400){return NextResponse.json({error:message},{status})}
async function identity(){const user=await currentUser();return user?.id?actorFor(user.id):null}
export async function GET(){try{const a=await identity();if(!a)return error("LOGIN_REQUIRED",401);if(!a.active)return error("SUSPENDED",403);if(a.role!=="ADMIN"&&!(await permitted(a,"AGENT_CREATE"))&&!(await permitted(a,"REFERRAL_ISSUE")))return error("FORBIDDEN",403);const r=await database().query("SELECT o.id,o.name,o.type,o.parent_id,o.status,o.created_at,m.user_id,m.role,u.username FROM km_organizations o LEFT JOIN km_organization_members m ON m.organization_id=o.id LEFT JOIN km_users u ON u.id=m.user_id WHERE $1='ADMIN' OR o.id=$2 OR o.parent_id=$2 ORDER BY o.created_at LIMIT 200",[a.role,a.org]);return NextResponse.json({organizations:r.rows},{headers:{"Cache-Control":"no-store"}})}catch(e){console.error("ORG_LIST",e instanceof Error?e.message:e);return error("ORG_DB_UNAVAILABLE",503)}}
export async function POST(req:Request){const a=await identity();if(!a)return error("LOGIN_REQUIRED",401);if(!a.active)return error("SUSPENDED",403);const origin=req.headers.get("origin");if(origin&&new URL(origin).host!==(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim())return error("INVALID_ORIGIN",403);
const b=await req.json().catch(()=>null);if(!b)return error("INVALID_JSON");const type=String(b.type||""),name=String(b.name||"").trim(),username=String(b.username||"").trim(),password=String(b.password||""),parent=type==="SUB_HQ"?ROOT:a.role==="ADMIN"?String(b.parentId||ROOT):a.org;
if(!["SUB_HQ","AGENT"].includes(type)||name.length<2||name.length>65||!/^[a-zA-Z0-9_]{4,20}$/.test(username)||password.length<12||password.length>128)return error("INVALID_INPUT");
if(type==="SUB_HQ"&&a.role!=="ADMIN")return error("HQ_ONLY",403);
if(type==="AGENT"&&a.role!=="ADMIN"&&!(a.role==="SUB_HQ"&&await permitted(a,"AGENT_CREATE")))return error("NO_DELEGATION",403);
if(type==="AGENT"&&a.role!=="ADMIN"&&parent!==a.org)return error("INVALID_PARENT",403);
const c=await database().connect();try{await c.query("BEGIN");const p=(await c.query("SELECT id,type,status FROM km_organizations WHERE id=$1 FOR UPDATE",[parent])).rows[0];
if(!p||p.status!=="ACTIVE"||(type==="SUB_HQ"&&p.type!=="HQ")||(type==="AGENT"&&!["HQ","SUB_HQ"].includes(p.type))){await c.query("ROLLBACK");return error("INVALID_ORG_PARENT",409)}
const passwordHash=await bcrypt.hash(password,12);
const u=(await c.query("INSERT INTO km_users(email,username,password_hash) VALUES($1,$2,$3) RETURNING id",[username.toLowerCase()+"@local.kmarkets.invalid",username,passwordHash])).rows[0];
const org=(await c.query("INSERT INTO km_organizations(type,name,parent_id,created_by) VALUES($1,$2,$3,$4) RETURNING id",[type,name,parent,a.id])).rows[0];
await c.query("INSERT INTO km_organization_members(organization_id,user_id,role) VALUES($1,$2,$3)",[org.id,u.id,type]);
const initialKeys=type==="AGENT"?PERMISSIONS.filter(key=>AGENT_PERMISSIONS.has(key)):PERMISSIONS;
let permittedKeys=initialKeys;
if(type==="AGENT"&&p.type==="SUB_HQ"&&parent){
 const delegated=await grantsFor(parent);
 permittedKeys=initialKeys.filter(key=>delegated.some(g=>g.key===key&&g.canDelegate));
}
for(const key of permittedKeys){
 const canDelegate=type==="SUB_HQ"&&AGENT_PERMISSIONS.has(key);
 await c.query("INSERT INTO km_permission_grants(subject_id,permission_key,granted_by,granted_status,can_delegate) VALUES($1,$2,$3,'ACTIVE',$4)",[org.id,key,a.id,canDelegate]);
 await c.query("INSERT INTO km_permission_change_logs(actor_id,subject_id,permission_key,old_value,new_value,reason) VALUES($1,$2,$3,NULL,$4::jsonb,$5)",[a.id,org.id,key,JSON.stringify({active:true,canDelegate}),"조직 생성 기본 권한 부여"]);
}

await c.query("INSERT INTO km_management_audit_logs(actor_id,target_id,action,after_data) VALUES($1,$2,$3,$4::jsonb)",[a.id,org.id,"ORG_CREATED",JSON.stringify({type,parent,username})]);
await c.query("COMMIT");return NextResponse.json({id:org.id,username,type},{status:201})}catch(e){await c.query("ROLLBACK");if((e as {code?:string}).code==="23505")return error("USERNAME_TAKEN",409);console.error("ORG_CREATE",e instanceof Error?e.message:e);return error("ORG_CREATE_FAILED",503)}finally{c.release()}}
