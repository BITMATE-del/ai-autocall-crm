import {NextRequest,NextResponse} from "next/server";
import {timingSafeEqual} from "node:crypto";
import {deliverAlerts} from "@/lib/telegram-alerts";
export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:NextRequest){
 if(process.env.KM_SERVICE_MODE==="admin")return NextResponse.json({ok:true,skipped:"ADMIN_PROJECT"});
 const secret=process.env.CRON_SECRET;
 const auth=req.headers.get("authorization")||"";
 const provided=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!secret||secret.length<24||Buffer.byteLength(secret)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(secret),Buffer.from(provided)))
  return NextResponse.json({error:"FORBIDDEN"},{status:403});
 try{return NextResponse.json({ok:true,...await deliverAlerts()},{headers:{"Cache-Control":"no-store"}})}
 catch(e){console.error("HFM_TG_DISPATCH_FAILURE",e instanceof Error?e.message:String(e));return NextResponse.json({error:"DISPATCH_FAILED"},{status:503})}
}
