import {NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {actorFor,grantsFor,PERMISSIONS,AGENT_PERMISSIONS} from "@/lib/org-access";
export const dynamic="force-dynamic";
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function POST(req:Request){
 const u=await currentUser();if(!u?.id)return fail("LOGIN_REQUIRED",401);
 const a=await actorFor(u.id);if(!a?.active||a.role!=="ADMIN")return fail("HQ_ONLY",403);
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return fail("INVALID_ORIGIN",403);
 const b=await req.json().catch(()=>null),id=String(b?.organizationId||"");
 if(!/^[0-9a-f-]{36}$/i.test(id))return fail("INVALID_INPUT");
 const client=await database().connect();
 try{
  await client.query("BEGIN");
  const org=(await client.query("SELECT id,type,status,parent_id FROM km_organizations WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(!org||org.type==="HQ"||org.status!=="ACTIVE"){await client.query("ROLLBACK");return fail("INVALID_ORGANIZATION",403)}
  let keys=org.type==="AGENT"?PERMISSIONS.filter(key=>AGENT_PERMISSIONS.has(key)):PERMISSIONS;
  if(org.type==="AGENT"){
   const parent=(await client.query("SELECT type FROM km_organizations WHERE id=$1",[org.parent_id])).rows[0];
   if(parent?.type==="SUB_HQ"){const allowed=await grantsFor(org.parent_id);keys=keys.filter(key=>allowed.some(g=>g.key===key&&g.canDelegate));}
  }
  await client.query("INSERT INTO km_org_permissions(key,allowed_roles,delegable,risk_level) SELECT unnest($1::text[]),ARRAY['SUB_HQ','AGENT']::text[],TRUE,'MEDIUM' ON CONFLICT(key) DO NOTHING",[PERMISSIONS]);
  for(const key of keys){
   const delegate=org.type==="SUB_HQ"&&AGENT_PERMISSIONS.has(key);
   const previous=(await client.query("SELECT granted_status,can_delegate FROM km_permission_grants WHERE subject_id=$1 AND permission_key=$2",[id,key])).rows[0]||null;
   await client.query(`INSERT INTO km_permission_grants(subject_id,permission_key,granted_by,granted_status,can_delegate)
    VALUES($1,$2,$3,'ACTIVE',$4) ON CONFLICT(subject_id,permission_key)
    DO UPDATE SET granted_status='ACTIVE',can_delegate=EXCLUDED.can_delegate,granted_by=EXCLUDED.granted_by,updated_at=NOW()`,[id,key,a.id,delegate]);
   await client.query("INSERT INTO km_permission_change_logs(actor_id,subject_id,permission_key,old_value,new_value,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)",[a.id,id,key,JSON.stringify(previous),JSON.stringify({active:true,canDelegate:delegate}),"본사 전체 권한 일괄 부여"]);
  }
  await client.query("COMMIT");
  return NextResponse.json({ok:true,count:keys.length},{headers:{"Cache-Control":"no-store"}});
 }catch(e){await client.query("ROLLBACK");console.error("PERMISSION_BULK_GRANT_FAILED",e instanceof Error?e.message:e);return fail("BULK_GRANT_FAILED",503)}finally{client.release()}
}
