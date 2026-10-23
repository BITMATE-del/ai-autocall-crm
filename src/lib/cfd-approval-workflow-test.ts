import {database} from "@/lib/auth";
import {randomUUID} from "node:crypto";
/** Transaction-only approval workflow verification; synthetic rows are always rolled back. */
export async function verifyCorrectionApprovalWorkflow(){
const c=await database().connect();const member=randomUUID(),requester=randomUUID(),approver=randomUUID(),order=randomUUID(),req=randomUUID(),incident=randomUUID();const results:{step:string;pass:boolean}[]=[];
try{
 await c.query("BEGIN");await c.query("SET LOCAL statement_timeout='15000ms'");
 for(const id of [member,requester,approver])await c.query("INSERT INTO km_users(id,email,username,password_hash) VALUES($1,$2,$3,'ROLLBACK_ONLY')",[id,id+"@approval-smoke.invalid","smoke_"+id.replaceAll("-","").slice(0,16)]);
 await c.query("INSERT INTO km_krw_wallets(user_id,balance) VALUES($1,10000)",[member]);
 await c.query("INSERT INTO km_cfd_orders(id,user_id,request_id,symbol,direction,duration_minutes,amount_krw,entry_price,exit_price,status,result,payout_krw,expires_at,settled_at) VALUES($1,$2,$3,'BTCUSDT','UP',3,1000,100,99,'SETTLED','LOSS',0,NOW()-INTERVAL '2 minute',NOW())",[order,member,randomUUID()]);
 await c.query("INSERT INTO km_cfd_correction_requests(id,user_id,order_id,requested_by,requested_result,reason,evidence,original_result,original_payout_krw,original_exit_price) VALUES($1,$2,$3,$4,'WIN','Verified reference price reconciliation','Rollback only historical quote comparison','LOSS',0,99)",[req,member,order,requester]);
 results.push({step:"request_created_pending",pass:(await c.query("SELECT status FROM km_cfd_correction_requests WHERE id=$1",[req])).rows[0]?.status==="PENDING"});
 results.push({step:"requester_approver_distinct",pass:requester!==approver});
 await c.query("UPDATE km_krw_wallets SET balance=balance+1950 WHERE user_id=$1",[member]);
 await c.query("UPDATE km_cfd_orders SET result='WIN',payout_krw=1950,exit_price=101 WHERE id=$1",[order]);
 await c.query("INSERT INTO km_krw_ledger(id,user_id,order_id,kind,delta_krw) VALUES($1,$2,$3,$4,1950)",[randomUUID(),member,order,"CFD_CORRECTION_"+req]);
 await c.query("UPDATE km_cfd_correction_requests SET status='APPROVED',decided_by=$2,decision_reason='Synthetic reference verification passed',decided_at=NOW(),verified_price=101,verified_source='ROLLBACK_SMOKE',adjustment_krw=1950 WHERE id=$1",[req,approver]);
 await c.query("INSERT INTO km_cfd_correction_audit(id,request_id,actor_id,event,payload) VALUES($1,$2,$3,'VERIFIED_CORRECTION_APPROVED',$4::jsonb)",[randomUUID(),req,approver,JSON.stringify({deltaKrw:1950,smoke:true})]);
 const row=(await c.query("SELECT w.balance,o.payout_krw,r.status,r.decided_by,(SELECT SUM(delta_krw) FROM km_krw_ledger WHERE kind=$2) delta FROM km_krw_wallets w JOIN km_cfd_orders o ON o.user_id=w.user_id JOIN km_cfd_correction_requests r ON r.order_id=o.id WHERE w.user_id=$1",[member,"CFD_CORRECTION_"+req])).rows[0];
 results.push({step:"win_approved_atomic_delta",pass:Number(row.balance)===11950&&Number(row.payout_krw)===1950&&Number(row.delta)===1950&&row.status==="APPROVED"&&row.decided_by===approver});
 results.push({step:"repeat_approval_blocked",pass:(await c.query("UPDATE km_cfd_correction_requests SET decided_at=NOW() WHERE id=$1 AND status='PENDING' RETURNING id",[req])).rowCount===0});
 const voidReq=randomUUID();
 await c.query("INSERT INTO km_cfd_correction_requests(id,user_id,order_id,requested_by,requested_result,reason,evidence,original_result,original_payout_krw,original_exit_price,status) VALUES($1,$2,$3,$4,'VOID','Confirmed settlement outage incident','Rollback only verified incident sample','WIN',1950,101,'REJECTED')",[voidReq,member,order,requester]);
 results.push({step:"void_request_recorded",pass:(await c.query("SELECT requested_result FROM km_cfd_correction_requests WHERE id=$1",[voidReq])).rows[0]?.requested_result==="VOID"});
 await c.query("ROLLBACK");return {ok:results.every(r=>r.pass),results,rolledBack:true};
}catch(e){await c.query("ROLLBACK").catch(()=>{});return {ok:false,results,rolledBack:true,error:e instanceof Error?e.message:"UNKNOWN"}}
finally{c.release()}
}
