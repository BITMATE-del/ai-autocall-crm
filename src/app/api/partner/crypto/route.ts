import {NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {actorFor,permitted} from "@/lib/org-access";
import {ensureBlockchainSchema} from "@/lib/blockchain-schema";
export const dynamic="force-dynamic";
export async function GET(){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 const a=await actorFor(u.id);if(!a?.active||a.role==="ADMIN"||!a.org||!(await permitted(a,"FUNDING_HISTORY")))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 try{await ensureBlockchainSchema();const r=await database().query(
 `SELECT r.id,r.kind,r.network,r.amount_usdt::text,r.amount_krw,r.address,r.status,r.created_at,u.username
 FROM km_crypto_requests r JOIN km_users u ON u.id=r.user_id
 JOIN km_member_attributions ma ON ma.user_id=r.user_id
 WHERE ma.organization_id=$1 OR ($2='SUB_HQ' AND ma.sub_hq_id=$1)
 ORDER BY (r.status='PENDING') DESC,r.created_at DESC LIMIT 200`,[a.org,a.role]);
 return NextResponse.json({requests:r.rows},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("PARTNER_CRYPTO_LIST_FAILED",e instanceof Error?e.message:"ERROR");return NextResponse.json({error:"UNAVAILABLE"},{status:503})}
}
