import {NextRequest,NextResponse} from "next/server";
import {botReply,consumePairToken,consumeAdminPairToken,consumeSubHqPairToken} from "@/lib/telegram-alerts";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const key=process.env.HFM_TELEGRAM_WEBHOOK_SECRET;
 if(!key||key.length<16||req.headers.get("x-telegram-bot-api-secret-token")!==key)
  return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const update=await req.json().catch(()=>null);
 const message=update?.message;
 const chat=message?.chat?.id;
 if(!chat||message.chat.type!=="private")return NextResponse.json({ok:true});
 const txt=String(message.text||"").trim();
 if(txt.startsWith("/start ")){
  const token=txt.slice(7).trim();
  const ok=(await consumeAdminPairToken(token,String(chat)).catch(()=>false))||(await consumeSubHqPairToken(token,String(chat)).catch(()=>false))||(await consumePairToken(token,String(chat)).catch(()=>false));
  await botReply(String(chat),ok?"HFM KOREA 담당 알림 연결이 완료되었습니다. 연결된 권한 범위에 해당하는 문의·입출금 신청을 알려드립니다.": "연결코드가 유효하지 않거나 만료됐습니다. 담당자 계정에서 새 연결코드를 발급해 주세요.");
 }else if(txt==="/start"){
  await botReply(String(chat),"담당자 사이트에서 본인 추천코드의 일회용 연결코드를 발급한 뒤 /start 연결코드 를 보내주세요.");
 }
 return NextResponse.json({ok:true});
}
