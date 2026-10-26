import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {database,currentUser,isAdmin} from "@/lib/auth";
import {ensureStockEventSchema} from "@/lib/stock-event";
export const dynamic="force-dynamic";
const error=(message:string,status=400)=>NextResponse.json({error:message},{status});
async function superAdmin(){const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return null;const r=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[u.id]);return r.rows[0]?.role==="SUPER_ADMIN"?u:null}
const originOK=(req:Request)=>{const origin=req.headers.get("origin");const host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();try{return !!origin&&new URL(origin).host===host}catch{return false}};
export async function GET(req:Request){
 const u=await superAdmin().catch(()=>null);if(!u)return error("HEADQUARTERS_ONLY",403);
 try{await ensureStockEventSchema();const q=(new URL(req.url).searchParams.get("q")||"").slice(0,80);
 const [members,grants]=await Promise.all([
 database().query("SELECT id,username,email FROM km_users WHERE $1='' OR username ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%' OR id::text ILIKE '%'||$1||'%' ORDER BY username LIMIT 70",[q]),
 database().query("SELECT g.id,g.event_key,g.event_name,g.symbol,g.granted_qty,g.available_qty,g.asset_type,g.notify_member,g.granted_at,g.user_id,u.username FROM km_stock_event_grants g JOIN km_users u ON u.id=g.user_id ORDER BY g.granted_at DESC LIMIT 100")]);
 return NextResponse.json({members:members.rows,grants:grants.rows},{headers:{"Cache-Control":"no-store"}})
 }catch(e){console.error("STOCK_EVENT_LIST_FAILED",e);return error("EVENT_LIST_UNAVAILABLE",503)}
}
export async function POST(req:Request){
 const admin=await superAdmin().catch(()=>null);if(!admin)return error("HEADQUARTERS_ONLY",403);
 if(!originOK(req))return error("INVALID_ORIGIN",403);
 const body=await req.json().catch(()=>null),symbol=String(body?.symbol||""),eventKey=String(body?.eventKey||"").trim(),eventName=String(body?.eventName||"").trim(),qtyText=String(body?.qty||""),notifyMember=body?.notifyMember!==false,users=body?.userIds;
 if(!/^\d{6}$/.test(symbol)||!/^.{3,100}$/.test(eventKey)||eventName.length<2||eventName.length>120||!/^[1-9]\d{0,5}$/.test(qtyText)||!Array.isArray(users)||users.length<1||users.length>100||users.some((id:unknown)=>typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))||new Set(users).size!==users.length)return error("INVALID_EVENT_REQUEST",400);
 const qty=Number(qtyText);const results:{userId:string;status:string;grantId?:string}[]=[];
 try{await ensureStockEventSchema();
 for(const userId of users){const c=await database().connect();try{
 await c.query("BEGIN");await c.query("SELECT id FROM km_users WHERE id=$1 FOR UPDATE",[userId]);
 const prior=await c.query("SELECT id FROM km_stock_event_grants WHERE event_key=$1 AND user_id=$2 AND symbol=$3",[eventKey,userId,symbol]);
 if(prior.rowCount){await c.query("ROLLBACK");results.push({userId,status:"ALREADY_GRANTED"});continue}
 const grantId=randomUUID();
 await c.query("INSERT INTO km_stock_event_grants(id,event_key,event_name,user_id,symbol,granted_qty,available_qty,granted_by,notify_member) VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8)",[grantId,eventKey,eventName,userId,symbol,qty,admin.id,notifyMember]);
 await c.query("INSERT INTO km_stock_positions(user_id,symbol,qty,cost_krw) VALUES($1,$2,$3,0) ON CONFLICT(user_id,symbol) DO UPDATE SET qty=km_stock_positions.qty+EXCLUDED.qty",[userId,symbol,qty]);
 await c.query("INSERT INTO km_stock_event_movements(id,grant_id,user_id,symbol,kind,qty_delta,actor_id) VALUES($1,$2,$3,$4,'GRANT',$5,$6)",[randomUUID(),grantId,userId,symbol,qty,admin.id]);
 await c.query("COMMIT");results.push({userId,status:"GRANTED",grantId});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});results.push({userId,status:"FAILED"});console.error("STOCK_EVENT_GRANT_FAILED",e)}finally{c.release()}}
 return NextResponse.json({ok:results.some(r=>r.status==="GRANTED"),assetType:"SIMULATED_STOCK",results,success:results.filter(r=>r.status==="GRANTED").length,failed:results.filter(r=>r.status!=="GRANTED").length});
 }catch(e){console.error("STOCK_EVENT_FAILED",e);return error("EVENT_UNAVAILABLE",503)}
}
export async function DELETE(req:Request){
 const admin=await superAdmin().catch(()=>null);if(!admin)return error("HEADQUARTERS_ONLY",403);
 if(!originOK(req))return error("INVALID_ORIGIN",403);
 const b=await req.json().catch(()=>null),id=String(b?.grantId||"");if(!/^[0-9a-f-]{36}$/i.test(id))return error("INVALID_GRANT_ID");
 try{await ensureStockEventSchema();const c=await database().connect();try{
 await c.query("BEGIN");
 const g=(await c.query("SELECT * FROM km_stock_event_grants WHERE id=$1 FOR UPDATE",[id])).rows[0];
 if(!g){await c.query("ROLLBACK");return error("GRANT_NOT_FOUND",404)}
 const already=await c.query("SELECT id FROM km_stock_event_movements WHERE grant_id=$1 AND kind='REVERSAL'",[id]);
 if(already.rowCount){await c.query("ROLLBACK");return error("ALREADY_REVERSED",409)}
 if(Number(g.available_qty)!==Number(g.granted_qty)){await c.query("ROLLBACK");return error("EVENT_SHARES_ALREADY_USED_REVIEW_REQUIRED",409)}
 const p=await c.query("UPDATE km_stock_positions SET qty=qty-$3 WHERE user_id=$1 AND symbol=$2 AND qty>=$3 RETURNING qty",[g.user_id,g.symbol,g.granted_qty]);
 if(!p.rowCount){await c.query("ROLLBACK");return error("INSUFFICIENT_SHARES_FOR_REVERSAL",409)}
 await c.query("UPDATE km_stock_event_grants SET available_qty=0 WHERE id=$1",[id]);
 await c.query("INSERT INTO km_stock_event_movements(id,grant_id,user_id,symbol,kind,qty_delta,actor_id) VALUES($1,$2,$3,$4,'REVERSAL',$5,$6)",[randomUUID(),id,g.user_id,g.symbol,-Number(g.granted_qty),admin.id]);
 await c.query("COMMIT");return NextResponse.json({ok:true});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}}
 catch(e){console.error("STOCK_EVENT_REVERSAL_FAILED",e);return error("REVERSAL_UNAVAILABLE",503)}
}
