import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {ensurePurchaseCorrectionSchema} from "@/lib/purchase-correction";
import {currentUser,database,isAdmin} from "@/lib/auth";
export const dynamic="force-dynamic";
const err=(error:string,status=400)=>NextResponse.json({error},{status});
async function admin(){const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return null;const x=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[u.id]);return x.rows[0]?.role==="SUPER_ADMIN"?u:null}
export async function GET(req:Request){
 const u=await admin().catch(()=>null);if(!u)return err("HEADQUARTERS_ONLY",403);
 const url=new URL(req.url),kind=url.searchParams.get("kind")==="STOCK"?"STOCK":"CFD",q=(url.searchParams.get("q")||"").slice(0,100);
 try{
 const c=database();
 const rows=kind==="CFD"?await c.query(`SELECT o.id,o.user_id,u.username,u.email,o.symbol,o.amount_krw AS amount,o.status,
 (SELECT SUM(delta_krw)::bigint FROM km_krw_ledger WHERE order_id=o.id AND kind='CFD_STAKE') AS stake_delta,
 (SELECT COUNT(*)::int FROM km_krw_ledger WHERE order_id=o.id AND kind='CFD_STAKE') AS stake_count,
 (SELECT requested_amount_krw FROM km_cfd_order_input_records WHERE order_id=o.id) AS original_requested
 FROM km_cfd_orders o JOIN km_users u ON u.id=o.user_id WHERE o.status='ACTIVE'
 AND ($1='' OR u.email ILIKE '%'||$1||'%' OR u.username ILIKE '%'||$1||'%' OR u.id::text ILIKE '%'||$1||'%' OR o.id::text ILIKE '%'||$1||'%' OR o.symbol ILIKE '%'||$1||'%')
 ORDER BY o.created_at DESC LIMIT 100`,[q]):await c.query(`SELECT p.user_id,p.symbol,p.qty,p.cost_krw AS amount,u.username,u.email,
 (SELECT COUNT(*)::int FROM km_stock_internal_orders z WHERE z.user_id=p.user_id AND z.symbol=p.symbol AND z.side='BUY') AS buy_count
 FROM km_stock_positions p JOIN km_users u ON u.id=p.user_id WHERE p.qty>0
 AND ($1='' OR u.email ILIKE '%'||$1||'%' OR u.username ILIKE '%'||$1||'%' OR u.id::text ILIKE '%'||$1||'%' OR p.symbol ILIKE '%'||$1||'%')
 ORDER BY u.username,p.symbol LIMIT 100`,[q]);
 return NextResponse.json({rows:rows.rows.map(r=>({...r,id:r.id||r.user_id+":"+r.symbol,status:r.status||"HELD",correctionAllowed:kind==="CFD"&&r.original_requested!=null&&Number(r.original_requested)!==Number(r.amount)&&Number(r.stake_delta)===-Number(r.amount)&&r.stake_count===1})),kind},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("PURCHASE_CORRECTION_LIST_ERROR",e);return err("CORRECTION_LIST_UNAVAILABLE",503)}
}
export async function POST(req:Request){
 const u=await admin().catch(()=>null);if(!u)return err("HEADQUARTERS_ONLY",403);
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();try{if(!origin||new URL(origin).host!==host)return err("INVALID_ORIGIN",403)}catch{return err("INVALID_ORIGIN",403)}
 const b=await req.json().catch(()=>null),kind=b?.kind,id=String(b?.id||""),target=String(b?.amount||"");
 if(!["CFD","STOCK"].includes(kind)||!/^[1-9]\d{0,10}$/.test(target))return err("INVALID_AMOUNT");
 const money=Number(target);if(!Number.isSafeInteger(money))return err("INVALID_AMOUNT");
 if(kind==="STOCK"){
 const parsed=/^([0-9a-f-]{36}):(\d{6})$/i.exec(id);if(!parsed)return err("INVALID_HOLDING",400);
 const [,member,symbol]=parsed;try{
 await ensurePurchaseCorrectionSchema();
 const c=await database().connect();try{
 await c.query("BEGIN");
 const holding=(await c.query("SELECT qty,cost_krw FROM km_stock_positions WHERE user_id=$1 AND symbol=$2 AND qty>0 FOR UPDATE",[member,symbol])).rows[0];
 if(!holding){await c.query("ROLLBACK");return err("HOLDING_NOT_FOUND",404)}
 const orders=await c.query("SELECT id,side,qty,gross_krw,price_krw,fee_krw,status FROM km_stock_internal_orders WHERE user_id=$1 AND symbol=$2 ORDER BY created_at FOR SHARE",[member,symbol]);
 const buys=orders.rows.filter(x=>x.side==="BUY"&&x.status==="INTERNAL_FILLED"),sells=orders.rows.filter(x=>x.side==="SELL");
 if(orders.rows.length!==1||buys.length!==1||sells.length){await c.query("ROLLBACK");return err("COMPLEX_POSITION_NEEDS_TRADE_LEDGER_RECONCILIATION",409)}
 const fill=buys[0],actualQty=Number(fill.qty),actualGross=Number(fill.gross_krw),fee=Number(fill.fee_krw);
 if(Number(holding.qty)!==actualQty||!Number.isSafeInteger(actualGross)||actualGross!==Number(fill.price_krw)*actualQty||fee!==0){await c.query("ROLLBACK");return err("STOCK_FILL_INTEGRITY_CHECK_FAILED",409)}
 if(actualGross!==money){await c.query("ROLLBACK");return err("AMOUNT_MUST_MATCH_EXECUTED_BUY",409)}
 const old=Number(holding.cost_krw);if(old===money){await c.query("ROLLBACK");return err("NO_CHANGE",409)}
 const buysLedger=await c.query("SELECT COALESCE(SUM(-delta_krw),0)::bigint AS total FROM km_krw_ledger WHERE user_id=$1 AND kind='STOCK_INTERNAL_BUY'",[member]);
 if(Number(buysLedger.rows[0]?.total)<money){await c.query("ROLLBACK");return err("STOCK_WALLET_LEDGER_MISMATCH",409)}
 const bal=(await c.query("SELECT balance FROM km_krw_wallets WHERE user_id=$1 FOR UPDATE",[member])).rows[0]?.balance;
 if(bal===undefined){await c.query("ROLLBACK");return err("WALLET_NOT_FOUND",409)}
 await c.query("UPDATE km_stock_positions SET cost_krw=$3 WHERE user_id=$1 AND symbol=$2 AND qty=$4",[member,symbol,money,actualQty]);
 await c.query("INSERT INTO km_purchase_correction_audit(id,user_id,trade_id,kind,old_amount,new_amount,actor_id,old_balance,new_balance) VALUES($1,$2,$3,'STOCK',$4,$5,$6,$7,$7)",[randomUUID(),member,fill.id,old,money,u.id,bal]);
 await c.query("COMMIT");return NextResponse.json({ok:true,before:old,after:money,delta:0,stockQtyUnchanged:true,walletUnchanged:true});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
 }catch(e){console.error("STOCK_PURCHASE_CORRECTION_FAILED",e);return err("STOCK_CORRECTION_FAILED",503)}
 }
 if(!/^[a-f\d-]{36}$/i.test(id))return err("INVALID_ORDER");
 try{
 const c=await database().connect();try{
 await c.query("BEGIN");
 const row=(await c.query("SELECT * FROM km_cfd_orders WHERE id=$1 FOR UPDATE",[id])).rows[0];
 if(!row||row.status!=="ACTIVE"||new Date(row.expires_at).getTime()<=Date.now()){await c.query("ROLLBACK");return err("ORDER_NOT_ACTIVE",409)}
 const record=(await c.query("SELECT requested_amount_krw FROM km_cfd_order_input_records WHERE order_id=$1 FOR UPDATE",[id])).rows[0];
 const recordedOriginal=record?.requested_amount_krw==null?null:Number(record.requested_amount_krw);
 const before=Number(row.amount_krw);
 const stake=(await c.query("SELECT COUNT(*)::int AS n,COALESCE(SUM(delta_krw),0)::bigint AS total FROM km_krw_ledger WHERE order_id=$1 AND kind='CFD_STAKE'",[id])).rows[0];
 if(stake.n!==1||Number(stake.total)!==-before){await c.query("ROLLBACK");return err("STAKE_LEDGER_MISMATCH",409)}
 if(before===money){await c.query("ROLLBACK");return err("NO_CHANGE",409)}
 const already=await c.query("SELECT id FROM km_purchase_correction_audit WHERE kind='CFD' AND trade_id=$1 LIMIT 1",[id]);
 if(already.rowCount){await c.query("ROLLBACK");return err("CORRECTION_ALREADY_APPLIED",409)}
 if(money<1000||money>100000000){await c.query("ROLLBACK");return err("AMOUNT_OUT_OF_RANGE",400)}

 const delta=money-before;
 if(delta>0){const debit=await c.query("UPDATE km_krw_wallets SET balance=balance-$2,updated_at=NOW() WHERE user_id=$1 AND balance>=$2 RETURNING balance",[row.user_id,delta]);if(!debit.rowCount){await c.query("ROLLBACK");return err("INSUFFICIENT_WALLET_BALANCE",409)}}
 else await c.query("UPDATE km_krw_wallets SET balance=balance+$2,updated_at=NOW() WHERE user_id=$1",[row.user_id,-delta]);
 const changeId=randomUUID();
 await c.query("UPDATE km_cfd_orders SET amount_krw=$2 WHERE id=$1 AND status='ACTIVE'",[id,money]);
 await c.query("INSERT INTO km_krw_ledger(id,user_id,order_id,kind,delta_krw) VALUES($1,$2,$3,$4,$5)",[randomUUID(),row.user_id,id,"CFD_STAKE_ADJUST_"+changeId,-delta]);
 await c.query("INSERT INTO km_purchase_correction_audit(id,user_id,trade_id,kind,old_amount,new_amount,actor_id,old_balance,new_balance) SELECT $1,$2,$3,'CFD',$4,$5,$6,$7,balance FROM km_krw_wallets WHERE user_id=$2",[changeId,row.user_id,id,before,money,u.id,Number((await c.query("SELECT balance FROM km_krw_wallets WHERE user_id=$1",[row.user_id])).rows[0].balance)+delta]);
 await c.query("COMMIT");return NextResponse.json({ok:true,before,after:money,delta,originalInputRecorded:recordedOriginal!==null,correctionBasis:"HEADQUARTERS_VERIFIED_MANUAL_AMOUNT"});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
 }catch(e){console.error("PURCHASE_CORRECTION_FAILED",e);return err("CORRECTION_FAILED",503)}
}
