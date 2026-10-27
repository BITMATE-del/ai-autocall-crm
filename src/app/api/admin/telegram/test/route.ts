import {NextRequest,NextResponse} from "next/server";
import {currentUser,database,isAdmin} from "@/lib/auth";
import {botReply} from "@/lib/telegram-alerts";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||req.nextUrl.host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const b=await req.json().catch(()=>null),chat=String(b?.chat||"");
 if(!/^-?[0-9]{1,20}$/.test(chat))return NextResponse.json({error:"INVALID_CHAT"},{status:400});
 const r=await database().query("SELECT 1 FROM km_tg_admin_chats WHERE chat_id=$1 UNION SELECT 1 FROM km_tg_subhq_chats WHERE chat_id=$1 UNION SELECT 1 FROM km_tg_subscriptions WHERE chat_id=$1 LIMIT 1",[chat]);
 if(!r.rowCount)return NextResponse.json({error:"NOT_LINKED"},{status:404});
 const ok=await botReply(chat,"[HFM KOREA] 알림 연결 테스트입니다. 실제 고객 신청이 아닙니다.");
 return NextResponse.json({ok},{status:ok?200:503});
}
