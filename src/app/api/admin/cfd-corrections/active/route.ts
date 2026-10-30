import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database,isAdmin} from "@/lib/auth";
import {actorFor,memberInScope,permitted} from "@/lib/org-access";
import {ensureCFDActiveOverrides} from "@/lib/cfd-active-overrides";
export const dynamic="force-dynamic";
const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(req:Request){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"FORBIDDEN"},{status:403});
 const admin=await isAdmin(u.id);
 if(admin){const role=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[u.id]);if(role.rows[0]?.role!=="SUPER_ADMIN")return NextResponse.json({error:"SUPER_ADMIN_REQUIRED"},{status:403})}
 else{const actor=await actorFor(u.id);if(!actor?.active||!(await permitted(actor,"CFD_CORRECTION")))return NextResponse.json({error:"PERMISSION_DENIED"},{status:403})}
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 try{if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403})}catch{return NextResponse.json({error:"INVALID_ORIGIN"},{status:403})}
 const b=await req.json().catch(()=>null),id=String(b?.orderId||""),value=String(b?.result||""),reason=String(b?.reason||"").trim();
 if(!valid.test(id)||!["AUTO","WIN","LOSS","VOID"].includes(value)||reason.length<5||reason.length>2000)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
 try{
  await ensureCFDActiveOverrides();
  const c=await database().connect();try{
   await c.query("BEGIN");
   const order=(await c.query("SELECT * FROM km_cfd_orders WHERE id=$1 FOR UPDATE",[id])).rows[0];
   if(!order||order.status!=="ACTIVE"){await c.query("ROLLBACK");return NextResponse.json({error:"ORDER_NOT_ACTIVE"},{status:409})}
   if(!admin){const actor=await actorFor(u.id);if(!actor?.active||!(await permitted(actor,"CFD_CORRECTION"))||!(await memberInScope(actor,order.user_id))){await c.query("ROLLBACK");return NextResponse.json({error:"ORDER_OUT_OF_SCOPE"},{status:403})}}
   const before=(await c.query("SELECT override_value FROM km_cfd_active_overrides WHERE order_id=$1",[id])).rows[0]?.override_value||"AUTO";
   if(value==="AUTO")await c.query("DELETE FROM km_cfd_active_overrides WHERE order_id=$1",[id]);
   else await c.query(`INSERT INTO km_cfd_active_overrides(order_id,override_value,reason,admin_id) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO UPDATE SET override_value=EXCLUDED.override_value,reason=EXCLUDED.reason,admin_id=EXCLUDED.admin_id,updated_at=NOW()`,[id,value,reason,u.id]);
   await c.query("INSERT INTO km_cfd_override_audit(id,order_id,admin_id,previous_value,new_value,reason) VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),id,u.id,before,value,reason]);
   await c.query("COMMIT");
   return NextResponse.json({ok:true,status:"ACTIVE",override:value,effect:"SAVED_PENDING_SETTLEMENT_VERIFICATION",message:value==="AUTO"?"자동 판정으로 복원했습니다.":value==="VOID"?"VOID는 검증된 장애 사건과 일치하는 경우에만 정산에 반영됩니다.":"관리자 보정값을 예약했습니다. 정산 시 원래 시장 판정과 보정 판정을 별도로 감사 기록합니다."});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
 }catch(e){console.error("CFD_ACTIVE_OVERRIDE_FAILED",e);return NextResponse.json({error:"OVERRIDE_FAILED"},{status:503})}
}
