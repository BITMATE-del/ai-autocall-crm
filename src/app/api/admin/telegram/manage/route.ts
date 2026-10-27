import {NextRequest,NextResponse} from "next/server";
import {currentUser,database,isAdmin} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(){
 const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 try{
 const [hq,sub,agent,stats]=await Promise.all([
 database().query("SELECT chat_id,admin_id AS owner,created_at,'ADMIN' AS role FROM km_tg_admin_chats ORDER BY created_at DESC LIMIT 100"),
 database().query("SELECT chat_id,operator_id AS owner,organization_id::text AS scope,created_at,'SUB_HQ' AS role FROM km_tg_subhq_chats ORDER BY created_at DESC LIMIT 100"),
 database().query("SELECT s.chat_id,s.agent_id AS owner,r.code AS scope,s.created_at,'AGENT' AS role FROM km_tg_subscriptions s JOIN km_referral_codes r ON r.id=s.referral_code_id ORDER BY s.created_at DESC LIMIT 100"),
 database().query("SELECT COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '1 day')::int AS daily FROM km_tg_events")
 ]);
 return NextResponse.json({connections:[...hq.rows,...sub.rows,...agent.rows],daily:stats.rows[0]?.daily||0},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"NOT_READY"},{status:503})}
}
export async function DELETE(req:NextRequest){
 const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||req.nextUrl.host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const body=await req.json().catch(()=>null);
 const chat=String(body?.chat||""),role=String(body?.role||""),scope=String(body?.scope||"");
 if(!/^-?[0-9]{1,20}$/.test(chat))return NextResponse.json({error:"INVALID_CHAT"},{status:400});
 const sql=role==="ADMIN"?"DELETE FROM km_tg_admin_chats WHERE chat_id=$1":role==="SUB_HQ"?"DELETE FROM km_tg_subhq_chats WHERE chat_id=$1 AND organization_id::text=$2":role==="AGENT"?"DELETE FROM km_tg_subscriptions WHERE chat_id=$1 AND referral_code_id IN (SELECT id FROM km_referral_codes WHERE code=$2)":null;
 if(!sql)return NextResponse.json({error:"INVALID_ROLE"},{status:400});
 await database().query(sql,role==="ADMIN"?[chat]:[chat,scope]);
 return NextResponse.json({ok:true});
}
