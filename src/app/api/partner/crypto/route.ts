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

export async function PATCH(req:Request){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 const a=await actorFor(u.id);if(!a?.active||a.role==="ADMIN"||!a.org||!(await permitted(a,"FUNDING_APPROVE")))return NextResponse.json({error:"PERMISSION_DENIED"},{status:403});
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const b=await req.json().catch(()=>null),id=String(b?.id||""),decision=String(b?.decision||""),tx=String(b?.txHash||"").trim(),note=String(b?.note||"").trim();
 if(!/^[\da-f-]{36}$/i.test(id)||!["APPROVED","REJECTED"].includes(decision)||note.length>500||(decision==="APPROVED"&&!/^(0x)?[a-fA-F0-9]{64}$/.test(tx)))return NextResponse.json({error:"INVALID_REQUEST_OR_TX_HASH"},{status:400});
 const {randomUUID}=await import("node:crypto");
 const {snapshotDeposit}=await import("@/lib/deposit-share");
 try{await ensureBlockchainSchema()}catch{return NextResponse.json({error:"BLOCKCHAIN_SETUP_PENDING"},{status:503})}
 const c=await database().connect();
 try{
  await c.query("BEGIN");
  const r=await c.query(`SELECT cr.* FROM km_crypto_requests cr
    JOIN km_member_attributions ma ON ma.user_id=cr.user_id
    WHERE cr.id=$1 AND (ma.organization_id=$2 OR ($3='SUB_HQ' AND ma.sub_hq_id=$2))
    FOR UPDATE OF cr`,[id,a.org,a.role]);
  const x=r.rows[0];
  if(!x){await c.query("ROLLBACK");return NextResponse.json({error:"OUT_OF_SCOPE"},{status:403})}
  if(x.status!=="PENDING"){await c.query("ROLLBACK");return NextResponse.json({error:"NOT_PENDING"},{status:409})}
  if(Number(x.funding_version)!==2||!x.amount_krw||!x.rate_krw_per_usdt){await c.query("ROLLBACK");return NextResponse.json({error:"LEGACY_REQUEST_REQUIRES_REVIEW"},{status:409})}
  const amount=Number(x.amount_krw);
  if(!Number.isSafeInteger(amount)||amount<=0){await c.query("ROLLBACK");return NextResponse.json({error:"INVALID_AMOUNT"},{status:400})}
  if(decision==="APPROVED"){
   if(x.kind==="DEPOSIT"){
    await c.query("INSERT INTO km_krw_wallets(user_id,balance) VALUES($1,0) ON CONFLICT DO NOTHING",[x.user_id]);
    await c.query("UPDATE km_krw_wallets SET balance=balance+$2::bigint,updated_at=NOW() WHERE user_id=$1",[x.user_id,x.amount_krw]);
    await c.query("INSERT INTO km_krw_ledger(id,user_id,kind,delta_krw) VALUES($1,$2,'BLOCKCHAIN_DEPOSIT',$3::bigint)",[randomUUID(),x.user_id,x.amount_krw]);
    await snapshotDeposit(c,{kind:"BLOCKCHAIN",sourceId:x.id,memberId:x.user_id,amount,confirmedAt:new Date(),asset:"USDT",originalAmount:String(x.amount_usdt),exchangeRate:String(x.rate_krw_per_usdt)});
   }else if(x.kind==="WITHDRAW"){
    await c.query("INSERT INTO km_krw_ledger(id,user_id,kind,delta_krw) VALUES($1,$2,'BLOCKCHAIN_WITHDRAW',-$3::bigint)",[randomUUID(),x.user_id,x.amount_krw]);
   }else throw Error("INVALID_KIND");
  }else if(x.kind==="WITHDRAW"){
   const wallet=await c.query("UPDATE km_krw_wallets SET balance=balance+$2::bigint,updated_at=NOW() WHERE user_id=$1 RETURNING balance",[x.user_id,x.amount_krw]);
   if(!wallet.rowCount)throw Error("MISSING_WALLET");
  }
  await c.query("UPDATE km_crypto_requests SET status=$2,tx_hash=$3,admin_note=$4,reviewed_by=$5,reviewed_at=NOW() WHERE id=$1",[id,decision,decision==="APPROVED"?tx.toLowerCase():null,note||null,a.id]);
  await c.query("INSERT INTO km_management_audit_logs(actor_id,target_id,action,after_data) VALUES($1,$2,'PARTNER_BLOCKCHAIN_REVIEW',$3::jsonb)",[a.id,x.user_id,JSON.stringify({requestId:id,decision,kind:x.kind,amountKrw:amount,amountUsdt:String(x.amount_usdt),network:x.network,organizationId:a.org})]);
  await c.query("COMMIT");
  return NextResponse.json({ok:true});
 }catch(e){await c.query("ROLLBACK").catch(()=>{});console.error("PARTNER_BLOCKCHAIN_REVIEW_FAILED",e instanceof Error?e.message:"ERROR");return NextResponse.json({error:"BLOCKCHAIN_SETTLEMENT_FAILED"},{status:409})}finally{c.release()}
}
