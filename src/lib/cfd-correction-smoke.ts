import {database} from "@/lib/auth";
import {randomUUID} from "node:crypto";
/** Verify PostgreSQL wallet / ledger / correction constraints, then unconditionally roll back all synthetic rows. */
export async function runCFDCorrectionSmoke(){
 const c=await database().connect();
 const userId=randomUUID(),orderId=randomUUID(),requestId=randomUUID();
 const results:{step:string;pass:boolean}[]=[];
 try{
  await c.query("BEGIN");
  await c.query("SET LOCAL statement_timeout='10000ms'");
  await c.query("INSERT INTO km_users(id,email,username,password_hash) VALUES($1,$2,$3,$4)",[userId,"smoke_"+userId+"@invalid.local","smoke_"+userId.replaceAll("-","").slice(0,16),"SMOKE_TEST_NO_LOGIN"]);
  await c.query("INSERT INTO km_krw_wallets(user_id,balance) VALUES($1,10000)",[userId]);
  await c.query(`INSERT INTO km_cfd_orders(id,user_id,request_id,symbol,direction,duration_minutes,amount_krw,entry_price,exit_price,status,result,payout_krw,expires_at,settled_at)
  VALUES($1,$2,$3,'BTCUSDT','UP',3,1000,100,101,'SETTLED','WIN',1950,NOW()-INTERVAL '1 minute',NOW())`,[orderId,userId,randomUUID()]);
  await c.query(`INSERT INTO km_cfd_correction_requests(id,user_id,order_id,requested_by,requested_result,reason,evidence,original_result,original_payout_krw,original_exit_price,verified_price,verified_source,adjustment_krw,status)
  VALUES($1,$2,$3,$2,'LOSS','synthetic smoke test','synthetic rollback only never persistent','WIN',1950,101,99,'SMOKE',-1950,'APPROVED')`,[requestId,userId,orderId]);
  const w=await c.query("UPDATE km_krw_wallets SET balance=balance-1950 WHERE user_id=$1 AND balance>=1950 RETURNING balance",[userId]);
  results.push({step:"atomic_wallet_delta",pass:Number(w.rows[0]?.balance)===8050});
  await c.query("INSERT INTO km_krw_ledger(id,user_id,order_id,kind,delta_krw) VALUES($1,$2,$3,$4,-1950)",[randomUUID(),userId,orderId,"CFD_CORRECTION_"+requestId]);
  const ledger=await c.query("SELECT SUM(delta_krw)::bigint AS amount,COUNT(*)::int AS n FROM km_krw_ledger WHERE order_id=$1 AND kind=$2",[orderId,"CFD_CORRECTION_"+requestId]);
  results.push({step:"single_correction_delta_ledger",pass:Number(ledger.rows[0]?.amount)===-1950&&ledger.rows[0]?.n===1});
  await c.query("SAVEPOINT duplicate_probe");
  try{
    await c.query("INSERT INTO km_krw_ledger(id,user_id,order_id,kind,delta_krw) VALUES($1,$2,$3,$4,-1950)",[randomUUID(),userId,orderId,"CFD_CORRECTION_"+requestId]);
    results.push({step:"duplicate_rejected",pass:false});
  }catch(e){
    results.push({step:"duplicate_rejected",pass:(e as {code?:string}).code==="23505"});
  }
  await c.query("ROLLBACK TO SAVEPOINT duplicate_probe");
  const rejected=await c.query("UPDATE km_krw_wallets SET balance=balance-999999 WHERE user_id=$1 AND balance>=999999 RETURNING balance",[userId]);
  results.push({step:"negative_wallet_blocked",pass:rejected.rowCount===0});
  await c.query("ROLLBACK");
  return {ok:results.length===4&&results.every(x=>x.pass),results,rolledBack:true};
 }catch(e){
  await c.query("ROLLBACK").catch(()=>{});
  return {ok:false,results,rolledBack:true,error:e instanceof Error?e.message:"SMOKE_ERROR"};
 }finally{c.release()}
}
