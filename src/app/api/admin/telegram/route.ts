import {NextRequest,NextResponse} from "next/server";
import {currentUser,isAdmin} from "@/lib/auth";
import {makeAdminPairToken} from "@/lib/telegram-alerts";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const origin=req.headers.get("origin");const host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||req.nextUrl.host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const token=await makeAdminPairToken(u.id);
 return NextResponse.json({pairCommand:"/start "+token,expiresMinutes:10},{headers:{"Cache-Control":"no-store"}});
}
