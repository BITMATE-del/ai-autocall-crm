import {NextRequest,NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {actorFor} from "@/lib/org-access";
import {makePairToken,makeSubHqPairToken} from "@/lib/telegram-alerts";
export const dynamic="force-dynamic";
export async function GET(){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 const a=await actorFor(u.id);if(!a?.active)return NextResponse.json({error:"FORBIDDEN"},{status:403});
 if(a.role==="SUB_HQ")return NextResponse.json({role:"SUB_HQ",codes:[]},{headers:{"Cache-Control":"no-store"}});
 const r=await database().query(`SELECT id,code FROM km_referral_codes WHERE status='ACTIVE' AND agent_id=$1 ORDER BY created_at DESC`,[u.id]);
 return NextResponse.json({role:a.role,codes:r.rows},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:NextRequest){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 const origin=req.headers.get("origin");const host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||req.nextUrl.host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const actor=await actorFor(u.id);if(!actor?.active||!actor.org||!["AGENT","SUB_HQ"].includes(actor.role))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 if(actor.role==="SUB_HQ"){
  const check=await database().query(`SELECT 1 FROM km_organization_members m JOIN km_organizations o ON o.id=m.organization_id
    JOIN km_organizations parent ON parent.id=o.parent_id
    WHERE m.user_id=$1 AND m.organization_id=$2 AND m.role='SUB_HQ'
      AND m.status='ACTIVE' AND o.type='SUB_HQ' AND o.status='ACTIVE' AND parent.status='ACTIVE'`,[u.id,actor.org]);
  if(!check.rowCount)return NextResponse.json({error:"OUT_OF_SCOPE"},{status:403});
  const token=await makeSubHqPairToken(u.id,actor.org);
  return NextResponse.json({pairCommand:"/start "+token,expiresMinutes:10},{headers:{"Cache-Control":"no-store"}});
 }
 const body=await req.json().catch(()=>null);
 const code=String(body?.code||"").trim();
 const r=await database().query(`SELECT c.id FROM km_referral_codes c
 JOIN km_organization_members m ON m.user_id=c.agent_id AND m.organization_id=c.organization_id AND m.status='ACTIVE'
 JOIN km_organizations o ON o.id=c.organization_id AND o.status='ACTIVE'
 WHERE c.agent_id=$1 AND upper(c.code)=upper($2) AND c.status='ACTIVE'`,[u.id,code]);
 if(!r.rowCount)return NextResponse.json({error:"CODE_NOT_OWNED"},{status:403});
 const token=await makePairToken(u.id,r.rows[0].id);
 return NextResponse.json({pairCommand:"/start "+token,expiresMinutes:10},{headers:{"Cache-Control":"no-store"}});
}
