import {NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {actorFor,grantsFor,PERMISSIONS,AGENT_PERMISSIONS,permitted} from "@/lib/org-access";
export const dynamic="force-dynamic";
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
export async function POST(req:Request){
 const u=await currentUser();if(!u?.id)return fail("LOGIN_REQUIRED",401);
 const a=await actorFor(u.id);if(!a?.active||!["ADMIN","SUB_HQ"].includes(a.role))return fail("FORBIDDEN",403);
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return fail("INVALID_ORIGIN",403);
 const b=await req.json().catch(()=>null),id=String(b?.organizationId||"");
 if(!/^[0-9a-f-]{36}$/i.test(id))return fail("INVALID_INPUT");
 const client=await database().connect();
 try{
  await client.query("BEGIN");
  const org=(await client.query("SELECT id,type,status,parent_id FROM km_organizations WHERE id=$1 FOR UPDATE",[id])).rows[0];
  if(!org||org.type==="HQ"||org.status!=="ACTIVE"){await client.query("ROLLBACK");return fail("INVALID_ORGANIZATION",403)}
  if(a.role==="SUB_HQ"&&(org.type!=="AGENT"||org.parent_id!==a.org||!(await permitted(a,"PERMISSION_DELEGATE")))){await client.query("ROLLBACK");return fail("OUT_OF_SCOPE",403)}
  let keys=org.type==="AGENT"?PERMISSIONS.filter(key=>AGENT_PERMISSIONS.has(key)):PERMISSIONS;
  if(org.type==="AGENT"){
   const parent=(await client.query("SELECT type FROM km_organizations WHERE id=$1",[org.parent_id])).rows[0];
   if(parent?.type==="SUB_HQ"){const allowed=await grantsFor(org.parent_id);keys=keys.filter(key=>allowed.some(g=>g.key===key&&g.canDelegate));}
  }
  await client.query("INSERT INTO km_org_permissions(key,allowed_roles,delegable,risk_level) SELECT unnest($1::text[]),ARRAY['SUB_HQ','AGENT']::text[],TRUE,'MEDIUM' ON CONFLICT(key) DO NOTHING",[PERMISSIONS]);
  // HQ full-grant to an agent includes the necessary upstream delegation.
  // Without this, the agent looks granted but effective permissions remain blocked.
  if(a.role==="ADMIN"&&org.type==="AGENT"){
   const parent=(await client.query("SELECT id,type,status FROM km_organizations WHERE id=$1 FOR UPDATE",[org.parent_id])).rows[0];
   if(parent?.type==="SUB_HQ"&&parent.status==="ACTIVE"){
    for(const key of PERMISSIONS.filter(k=>AGENT_PERMISSIONS.has(k))){
     const previous=(await client.query("SELECT granted_status,can_delegate FROM km_permission_grants WHERE subject_id=$1 AND permission_key=$2",[parent.id,key])).rows[0]||null;
     if(previous?.granted_status==="ACTIVE"&&previous?.can_delegate===true)continue;
     await client.query(`INSERT INTO km_permission_grants(subject_id,permission_key,granted_by,granted_status,can_delegate)
      VALUES($1,$2,$3,'ACTIVE',TRUE) ON CONFLICT(subject_id,permission_key)
      DO UPDATE SET granted_status='ACTIVE',can_delegate=TRUE,granted_by=EXCLUDED.granted_by,updated_at=NOW()`,[parent.id,key,a.id]);
     await client.query("INSERT INTO km_permission_change_logs(actor_id,subject_id,permission_key,old_value,new_value,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)",[a.id,parent.id,key,JSON.stringify(previous),JSON.stringify({active:true,canDelegate:true}),"본사 영업자 전체 권한 부여에 따른 상위 위임 보완"]);
    }
    keys=PERMISSIONS.filter(k=>AGENT_PERMISSIONS.has(k));
   }
  }

  for(const key of keys){
   const delegate=org.type==="SUB_HQ"&&AGENT_PERMISSIONS.has(key);
   const previous=(await client.query("SELECT granted_status,can_delegate FROM km_permission_grants WHERE subject_id=$1 AND permission_key=$2",[id,key])).rows[0]||null;
   await client.query(`INSERT INTO km_permission_grants(subject_id,permission_key,granted_by,granted_status,can_delegate)
    VALUES($1,$2,$3,'ACTIVE',$4) ON CONFLICT(subject_id,permission_key)
    DO UPDATE SET granted_status='ACTIVE',can_delegate=EXCLUDED.can_delegate,granted_by=EXCLUDED.granted_by,updated_at=NOW()`,[id,key,a.id,delegate]);
   await client.query("INSERT INTO km_permission_change_logs(actor_id,subject_id,permission_key,old_value,new_value,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)",[a.id,id,key,JSON.stringify(previous),JSON.stringify({active:true,canDelegate:delegate}),a.role==="ADMIN"?"본사 전체 권한 일괄 부여":"부본사 하부 영업자 전체 권한 부여"]);
  }
  await client.query("COMMIT");
  return NextResponse.json({ok:true,count:keys.length},{headers:{"Cache-Control":"no-store"}});
 }catch(e){await client.query("ROLLBACK");console.error("PERMISSION_BULK_GRANT_FAILED",e instanceof Error?e.message:e);return fail("BULK_GRANT_FAILED",503)}finally{client.release()}
}
