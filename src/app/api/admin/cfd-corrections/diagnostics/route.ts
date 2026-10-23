import {NextResponse} from "next/server";
import {currentUser,database,isAdmin} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(){
 const u=await currentUser();
 if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
 try{
 const c=await database().connect();try{
 await c.query("BEGIN READ ONLY");
 const tables=await c.query("SELECT name, to_regclass('public.'||name) IS NOT NULL AS present FROM unnest($1::text[]) AS name",[['km_users','km_cfd_orders','km_cfd_correction_requests','km_cfd_correction_audit','km_krw_wallets','km_krw_ledger']]);
 const all=tables.rows.every(x=>x.present);
 const checks:{key:string;count:number;pass:boolean}[]=[];
 if(all){
 const queries=[
 ["duplicate_correction_payout",`SELECT COUNT(*)::int AS n FROM (SELECT order_id,kind,COUNT(*) FROM km_krw_ledger WHERE kind LIKE 'CFD_CORRECTION_%' GROUP BY order_id,kind HAVING COUNT(*)>1) x`],
 ["correction_ledger_mismatch",`SELECT COUNT(*)::int AS n FROM km_cfd_correction_requests r WHERE r.status='APPROVED' AND COALESCE(r.adjustment_krw,0)<>COALESCE((SELECT SUM(l.delta_krw) FROM km_krw_ledger l WHERE l.order_id=r.order_id AND l.kind='CFD_CORRECTION_'||r.id::text),0)`],
 ["negative_wallet",`SELECT COUNT(*)::int AS n FROM km_krw_wallets WHERE balance<0`],
 ["approved_without_audit",`SELECT COUNT(*)::int AS n FROM km_cfd_correction_requests r WHERE r.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM km_cfd_correction_audit a WHERE a.request_id=r.id AND a.event='VERIFIED_CORRECTION_APPROVED')`],
 ["request_without_audit",`SELECT COUNT(*)::int AS n FROM km_cfd_correction_requests r WHERE NOT EXISTS(SELECT 1 FROM km_cfd_correction_audit a WHERE a.request_id=r.id)`],
 ];
 for(const [key,sql] of queries){const v=await c.query(sql);const count=Number(v.rows[0]?.n||0);checks.push({key,count,pass:count===0})}
 }
 const trigger=all?(await c.query("SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='km_cfd_correction_audit_immutable' AND NOT tgisinternal) AS active")).rows[0]?.active===true:false;
 await c.query("COMMIT");
 return NextResponse.json({ok:all&&trigger&&checks.every(x=>x.pass),tables:tables.rows,auditImmutableTrigger:trigger,checks,readOnly:true,at:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
 }catch(e){console.error("CFD_DIAGNOSTICS_FAILED",e);return NextResponse.json({error:"DIAGNOSTICS_UNAVAILABLE",readOnly:true},{status:503})}
}
