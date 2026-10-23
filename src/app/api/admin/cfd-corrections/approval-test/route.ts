import {NextResponse} from "next/server";
import {currentUser,database,isAdmin} from "@/lib/auth";
import {verifyCorrectionApprovalWorkflow} from "@/lib/cfd-approval-workflow-test";
export const dynamic="force-dynamic";
export async function GET(){const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});try{const r=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[u.id]);if(r.rows[0]?.role!=="SUPER_ADMIN")return NextResponse.json({error:"SUPER_ADMIN_REQUIRED"},{status:403});const result=await verifyCorrectionApprovalWorkflow();return NextResponse.json({...result,checkedAt:new Date().toISOString(),scope:"ROLLBACK_ONLY_SYNTHETIC_WORKFLOW_NOT_LIVE_HTTP_APPROVAL"},{status:result.ok?200:503,headers:{"Cache-Control":"no-store"}})}catch{return NextResponse.json({error:"WORKFLOW_TEST_UNAVAILABLE"},{status:503})}}
