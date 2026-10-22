import {NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {ensureBlockchainSchema} from "@/lib/blockchain-schema";
export const dynamic="force-dynamic";
export async function GET(){const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});try{await ensureBlockchainSchema();const r=await database().query(`SELECT a.network,p.address,p.status
 FROM km_member_deposit_addresses a
 JOIN km_org_deposit_addresses p ON p.id=a.address_id AND p.organization_id=a.organization_id
 JOIN km_member_attributions m ON m.user_id=a.member_id AND m.organization_id=a.organization_id
 WHERE a.member_id=$1 ORDER BY a.network`,[u.id]);return NextResponse.json({addresses:r.rows},{headers:{"Cache-Control":"no-store"}})}catch{return NextResponse.json({error:"ADDRESS_SERVICE_UNAVAILABLE"},{status:503})}}
