import {NextRequest,NextResponse} from "next/server";
import {randomBytes,randomUUID} from "node:crypto";
import bcrypt from "bcryptjs";
import {currentUser,database,isAdmin} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const admin=await currentUser();
 if(!admin?.id||!(await isAdmin(admin.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||req.nextUrl.host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const role=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[admin.id]);
 if(role.rows[0]?.role!=="SUPER_ADMIN")return NextResponse.json({error:"HEADQUARTERS_ONLY"},{status:403});
 const b=await req.json().catch(()=>null),id=String(b?.id||"");
 if(!/^[0-9a-f-]{36}$/i.test(id)||id===admin.id)return NextResponse.json({error:"INVALID_MEMBER"},{status:400});
 // One-time strong random password. Only its bcrypt hash persists in the database.
 const password="Hm!"+randomBytes(15).toString("base64url");
 const hash=await bcrypt.hash(password,12);
 const c=await database().connect();
 try{
  await c.query("BEGIN");
  const target=await c.query("SELECT id,username FROM km_users WHERE id=$1 FOR UPDATE",[id]);
  if(!target.rowCount){await c.query("ROLLBACK");return NextResponse.json({error:"MEMBER_NOT_FOUND"},{status:404})}
  const privileged=await c.query("SELECT 1 FROM km_admin_roles WHERE user_id=$1",[id]);
  const org=await c.query("SELECT 1 FROM km_organization_members WHERE user_id=$1",[id]);
  if(privileged.rowCount||org.rowCount){await c.query("ROLLBACK");return NextResponse.json({error:"STAFF_TARGET_DENIED"},{status:403})}
  await c.query("UPDATE km_users SET password_hash=$2 WHERE id=$1",[id,hash]);
  await c.query("CREATE TABLE IF NOT EXISTS km_admin_member_audit(id UUID PRIMARY KEY,admin_id UUID NOT NULL REFERENCES km_users(id),member_id UUID NOT NULL REFERENCES km_users(id),action TEXT NOT NULL,detail JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await c.query("INSERT INTO km_admin_member_audit(id,admin_id,member_id,action,detail) VALUES($1,$2,$3,'PASSWORD_RESET',$4::jsonb)",[randomUUID(),admin.id,id,JSON.stringify({method:"ADMIN_RANDOM_TEMP_PASSWORD",member:target.rows[0].username})]);
  await c.query("COMMIT");
  return NextResponse.json({ok:true,temporaryPassword:password},{headers:{"Cache-Control":"no-store","Pragma":"no-cache"}});
 }catch(e){await c.query("ROLLBACK");console.error("ADMIN_PASSWORD_RESET_FAILED",e instanceof Error?e.message:String(e));return NextResponse.json({error:"RESET_FAILED"},{status:503})}finally{c.release()}
}
