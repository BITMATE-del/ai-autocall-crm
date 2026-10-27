import {NextRequest,NextResponse} from "next/server";
import bcrypt from "bcryptjs";
import {currentUser,database,throttle} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||req.nextUrl.host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const b=await req.json().catch(()=>null);
 const old=String(b?.currentPassword||""),next=String(b?.newPassword||"");
 if(!old||next.length<12||next.length>128||!/[^A-Za-z0-9]/.test(next)||!/[A-Za-z]/.test(next)||!/[0-9]/.test(next)||old===next)return NextResponse.json({error:"PASSWORD_POLICY"},{status:400});
 const limit=await throttle("member-password-change",u.id,5,3600);
 if(!limit.allowed)return NextResponse.json({error:"TOO_MANY_ATTEMPTS"},{status:429});
 const c=await database().connect();
 try{
  await c.query("BEGIN");
  const result=await c.query("SELECT password_hash FROM km_users WHERE id=$1 FOR UPDATE",[u.id]);
  if(!result.rowCount||!(await bcrypt.compare(old,result.rows[0].password_hash))){await c.query("ROLLBACK");return NextResponse.json({error:"CURRENT_PASSWORD_INCORRECT"},{status:403})}
  const hash=await bcrypt.hash(next,12);
  await c.query("UPDATE km_users SET password_hash=$2 WHERE id=$1",[u.id,hash]);
  await c.query("COMMIT");
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch(e){await c.query("ROLLBACK");return NextResponse.json({error:"CHANGE_FAILED"},{status:503})}finally{c.release()}
}
