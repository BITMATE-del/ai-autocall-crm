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
 if(!token||!secret||!/^[A-Za-z0-9_-]{16,256}$/.test(secret))
  return NextResponse.json({error:"BOT_CONFIGURATION_MISSING"},{status:503});
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
