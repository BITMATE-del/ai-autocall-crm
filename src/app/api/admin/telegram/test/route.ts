import {NextRequest,NextResponse} from "next/server";
import {currentUser,database,isAdmin} from "@/lib/auth";

export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||req.nextUrl.host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const b=await req.json().catch(()=>null),chat=String(b?.chat||"");
 if(!/^-?[0-9]{1,20}$/.test(chat))return NextResponse.json({error:"INVALID_CHAT"},{status:400});
 const r=await database().query("SELECT 1 FROM km_tg_admin_chats WHERE chat_id=$1 UNION SELECT 1 FROM km_tg_subhq_chats WHERE chat_id=$1 UNION SELECT 1 FROM km_tg_subscriptions WHERE chat_id=$1 LIMIT 1",[chat]);
 if(!r.rowCount)return NextResponse.json({error:"NOT_LINKED"},{status:404});
 const token=process.env.HFM_TELEGRAM_BOT_TOKEN;
 if(!token)return NextResponse.json({error:"BOT_TOKEN_MISSING"},{status:503});
 try{
  const response=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:chat,text:"[HFM KOREA] 알림 연결 테스트입니다. 실제 고객 신청이 아닙니다."}),cache:"no-store",signal:AbortSignal.timeout(9000)});
  const result=await response.json().catch(()=>({}));
  if(response.ok&&result.ok)return NextResponse.json({ok:true});
  const code=Number(result.error_code||response.status);
  const description=String(result.description||"").toLowerCase();
  const reason=code===401?"TELEGRAM_BOT_AUTH_FAILED":code===403?"TELEGRAM_CHAT_BLOCKED":code===400&&/chat not found/.test(description)?"TELEGRAM_CHAT_NOT_FOUND":code===429?"TELEGRAM_RATE_LIMIT":"TELEGRAM_SEND_FAILED";
  console.error("HFM_TELEGRAM_TEST_FAILURE",{code,reason});
  return NextResponse.json({error:reason,telegramStatus:code},{status:502});
 }catch(e){console.error("HFM_TELEGRAM_TEST_NETWORK",e instanceof Error?e.name:"ERROR");return NextResponse.json({error:"TELEGRAM_NETWORK_UNAVAILABLE"},{status:503})}
}
