import {NextRequest,NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {actorFor} from "@/lib/org-access";
export const dynamic="force-dynamic";
async function context(){
 const u=await currentUser();if(!u?.id)return null;
 const a=await actorFor(u.id);
 if(!a?.active||!a.org||!["SUB_HQ","AGENT"].includes(a.role))return null;
 return {u,a};
}
async function chats(id:string,org:string,role:string){
 const r=role==="SUB_HQ"?await database().query(
 "SELECT chat_id FROM km_tg_subhq_chats WHERE operator_id=$1 AND organization_id=$2",[id,org]):
 await database().query("SELECT DISTINCT s.chat_id FROM km_tg_subscriptions s JOIN km_referral_codes c ON c.id=s.referral_code_id WHERE s.agent_id=$1 AND c.organization_id=$2",[id,org]);
 return r.rows.map(x=>String(x.chat_id));
}
export async function GET(){
 const c=await context();if(!c)return NextResponse.json({error:"FORBIDDEN"},{status:403});
 try{const linked=await chats(c.u.id,c.a.org!,c.a.role);
 return NextResponse.json({connected:linked.length>0,count:linked.length},{headers:{"Cache-Control":"no-store"}})
 }catch{return NextResponse.json({error:"STATUS_UNAVAILABLE"},{status:503})}
}
export async function POST(req:NextRequest){
 const c=await context();if(!c)return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||req.nextUrl.host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 try{
  const linked=await chats(c.u.id,c.a.org!,c.a.role);
  if(!linked.length)return NextResponse.json({error:"NOT_LINKED"},{status:404});
  const token=process.env.HFM_TELEGRAM_BOT_TOKEN;
  if(!token)return NextResponse.json({error:"BOT_NOT_CONFIGURED"},{status:503});
  const results=await Promise.all(linked.slice(0,10).map(async chat=>{
   try{const r=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chat,text:"[HFM KOREA] 담당자 알림 연결 테스트입니다."}),signal:AbortSignal.timeout(8000)});
   const j=await r.json().catch(()=>({}));
   return {ok:r.ok&&j.ok,status:r.status}
   }catch{return {ok:false,status:0}}
  }));
  const sent=results.filter(x=>x.ok).length;
  return NextResponse.json({ok:sent>0,sent,attempted:results.length,error:sent?"":"TELEGRAM_DELIVERY_FAILED"},{status:sent?200:503});
 }catch{return NextResponse.json({error:"TEST_UNAVAILABLE"},{status:503})}
}
