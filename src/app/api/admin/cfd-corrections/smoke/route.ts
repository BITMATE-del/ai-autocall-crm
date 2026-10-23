import {NextResponse} from "next/server";
import {currentUser,database,isAdmin} from "@/lib/auth";
import {runCFDCorrectionSmoke} from "@/lib/cfd-correction-smoke";
export const dynamic="force-dynamic";
export async function GET(){
 const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 try{const r=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[u.id]);
 if(r.rows[0]?.role!=="SUPER_ADMIN")return NextResponse.json({error:"SUPER_ADMIN_REQUIRED"},{status:403});
 const result=await runCFDCorrectionSmoke();
 return NextResponse.json({...result,checkedAt:new Date().toISOString()},{status:result.ok?200:503,headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"SMOKE_UNAVAILABLE"},{status:503})}
}
