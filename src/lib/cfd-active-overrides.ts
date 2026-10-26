import {database} from "@/lib/auth";
export async function ensureCFDActiveOverrides(){
 await database().query(`CREATE TABLE IF NOT EXISTS km_cfd_active_overrides(
 order_id UUID PRIMARY KEY REFERENCES km_cfd_orders(id),
 override_value TEXT NOT NULL CHECK(override_value IN ('WIN','LOSS','VOID')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 2000),
 admin_id UUID NOT NULL REFERENCES km_users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await database().query(`CREATE TABLE IF NOT EXISTS km_cfd_override_audit(
 id UUID PRIMARY KEY,order_id UUID NOT NULL REFERENCES km_cfd_orders(id),
 admin_id UUID NOT NULL REFERENCES km_users(id),
 previous_value TEXT,new_value TEXT NOT NULL,reason TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}
export async function getActiveSettlementDecision(client:{query:(sql:string,params?:unknown[])=>Promise<{rows:any[]}>},trade:{id:string;symbol:string;expires_at:string;duration_minutes:number;amount_krw:string},verified:{result:string;payout:number;source:string}){
 const r=await client.query("SELECT override_value FROM km_cfd_active_overrides WHERE order_id=$1",[trade.id]);
 const desired=r.rows[0]?.override_value;
 if(!desired)return {...verified,applied:"AUTO",warning:null};
 if(desired==="VOID"){
  const exists=await client.query("SELECT to_regclass('public.km_cfd_verified_incidents') AS table_name");
  if(!exists.rows[0]?.table_name)return {...verified,applied:"AUTO",warning:"VOID_EVIDENCE_UNAVAILABLE"};
  const proof=await client.query("SELECT id FROM km_cfd_verified_incidents WHERE symbol=$1 AND reviewed_at IS NOT NULL AND start_at<=$2 AND end_at>=$3 LIMIT 1",[trade.symbol,new Date(new Date(trade.expires_at).getTime()-Number(trade.duration_minutes)*60000),trade.expires_at]);
  if(proof.rows.length)return {...verified,result:"VOID",payout:Number(trade.amount_krw),applied:"VOID",source:"VERIFIED_INCIDENT:"+proof.rows[0].id,warning:null};
  return {...verified,applied:"AUTO",warning:"VOID_EVIDENCE_UNAVAILABLE"};
 }
 if(desired!==verified.result)return {...verified,applied:"AUTO",warning:"REQUESTED_RESULT_CONFLICTS_WITH_MARKET"};
 return {...verified,applied:desired,warning:null};
}
