import type {PoolClient} from "pg";
export type DepositSource="KRW"|"BLOCKCHAIN";
export const basis=(amount:number,rate:number)=>{if(!Number.isSafeInteger(amount)||amount<=0||!Number.isInteger(rate)||rate<0||rate>10000)throw Error("INVALID_BASIS");const h=Math.floor(amount*rate/10000);return {hq:h,agent:amount-h}};
/** Only record a non-payable allocation snapshot for a genuinely confirmed deposit. Caller owns transaction. */
export async function snapshotDeposit(c:PoolClient,input:{kind:DepositSource;sourceId:string;memberId:string;amount:number;confirmedAt:Date;asset:string;originalAmount:string;exchangeRate:string}){
 const at=(await c.query("SELECT ma.agent_id,ma.organization_id AS agent_org_id,ma.sub_hq_id,o.parent_id,o.type,o.status,p.status AS parent_status FROM km_member_attributions ma JOIN km_organizations o ON o.id=ma.organization_id LEFT JOIN km_organizations p ON p.id=o.parent_id WHERE ma.user_id=$1 FOR SHARE OF ma",[input.memberId])).rows[0];
 // Unattributed / headquarters-direct deposits must not be silently credited to a salesperson.
 if(!at?.agent_id||!at.sub_hq_id||at.type!=="AGENT"||at.status!=="ACTIVE"||at.parent_status!=="ACTIVE")return {recorded:false,reason:"NO_ACTIVE_SUB_HQ_AGENT"};
 const org=at.sub_hq_id;
 const individual=(await c.query("SELECT sub_hq_rate_bps FROM km_deposit_share_policies WHERE organization_id=$1 AND effective_at<=$2 ORDER BY effective_at DESC,id DESC LIMIT 1",[at.agent_org_id,input.confirmedAt])).rows[0];
 const parent=(await c.query("SELECT sub_hq_rate_bps,min_rate_bps,max_rate_bps,allow_agent_override FROM km_deposit_share_policies WHERE organization_id=$1 AND effective_at<=$2 ORDER BY effective_at DESC,id DESC LIMIT 1",[org,input.confirmedAt])).rows[0];
 if(!parent)return {recorded:false,reason:"SUB_HQ_POLICY_MISSING"};
 const rate=parent.allow_agent_override&&individual?Number(individual.sub_hq_rate_bps):Number(parent.sub_hq_rate_bps);
 if(rate<Number(parent.min_rate_bps)||rate>Number(parent.max_rate_bps))return {recorded:false,reason:"OUT_OF_POLICY_RANGE"};
 const b=basis(input.amount,rate);
 const r=await c.query("INSERT INTO km_deposit_share_records(source_kind,source_id,member_id,agent_id,agent_org_id,sub_hq_id,deposit_amount_krw,original_asset,original_amount,exchange_rate,sub_hq_rate_bps,agent_rate_bps,sub_hq_base_krw,agent_base_krw,confirmed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(source_kind,source_id) DO NOTHING RETURNING id",[input.kind,input.sourceId,input.memberId,at.agent_id,at.agent_org_id,org,input.amount,input.asset,input.originalAmount,input.exchangeRate,rate,10000-rate,b.hq,b.agent,input.confirmedAt]);
 return {recorded:!!r.rowCount,reason:r.rowCount?"CALCULATED":"DUPLICATE"};
}
