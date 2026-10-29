import {NextRequest,NextResponse} from "next/server";
import {currentUser,isAdmin} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const origin=req.headers.get("origin");
 const host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||req.nextUrl.host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const token=process.env.HFM_TELEGRAM_BOT_TOKEN;
 const secret=process.env.HFM_TELEGRAM_WEBHOOK_SECRET;
 if(!token)return NextResponse.json({error:"BOT_TOKEN_MISSING",message:"관리자 Production 배포에 봇 토큰이 적용되지 않았습니다. 환경변수 저장 후 새 Production 배포를 생성해 주세요."},{status:503});
 if(!secret)return NextResponse.json({error:"WEBHOOK_SECRET_MISSING",message:"관리자 Production 배포에 웹훅 인증키가 적용되지 않았습니다. 환경변수 저장 후 새 Production 배포를 생성해 주세요."},{status:503});
 if(!/^[A-Za-z0-9_-]{16,256}$/.test(secret))return NextResponse.json({error:"INVALID_WEBHOOK_SECRET_FORMAT",message:"웹훅 인증키는 영문·숫자·밑줄·하이픈만 사용해 16~256자로 설정해야 합니다. 공백 및 특수기호는 사용할 수 없습니다."},{status:503});
 try{
  const r=await fetch("https://api.telegram.org/bot"+token+"/setWebhook",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({url:"https://hfmtrade.co.kr/api/telegram/webhook",secret_token:secret,drop_pending_updates:false}),
   signal:AbortSignal.timeout(10000)
  });
  const result=await r.json();
  if(!r.ok||!result.ok)return NextResponse.json({error:"TELEGRAM_SETUP_FAILED"},{status:502});
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:"TELEGRAM_UNREACHABLE"},{status:503})}
}

export async function GET(){
 const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const token=process.env.HFM_TELEGRAM_BOT_TOKEN;
 if(!token)return NextResponse.json({error:"BOT_TOKEN_MISSING"},{status:503});
 try{
  const r=await fetch("https://api.telegram.org/bot"+token+"/getWebhookInfo",{cache:"no-store",signal:AbortSignal.timeout(7000)});
  const j=await r.json();
  if(!r.ok||!j.ok)return NextResponse.json({error:"WEBHOOK_STATUS_FAILED"},{status:502});
  const info=j.result||{};
  return NextResponse.json({ok:true,configuredUrl:info.url||null,expectedUrl:"https://hfmtrade.co.kr/api/telegram/webhook",pendingUpdates:info.pending_update_count??null,lastErrorDate:info.last_error_date?new Date(info.last_error_date*1000).toISOString():null,lastErrorMessage:String(info.last_error_message||"").slice(0,300)||null,maxConnections:info.max_connections??null},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"TELEGRAM_STATUS_UNREACHABLE"},{status:503})}
}
