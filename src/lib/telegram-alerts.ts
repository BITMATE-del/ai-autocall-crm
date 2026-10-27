import {randomBytes} from "node:crypto";
import {database} from "@/lib/auth";

let prepared:Promise<void>|undefined;
async function schema(){
 if(!prepared)prepared=(async()=>{
  await database().query(`CREATE TABLE IF NOT EXISTS km_tg_subscriptions(
    chat_id TEXT NOT NULL,agent_id UUID NOT NULL REFERENCES km_users(id),
    referral_code_id UUID NOT NULL REFERENCES km_referral_codes(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(chat_id,referral_code_id))`);
  await database().query(`CREATE TABLE IF NOT EXISTS km_tg_admin_chats(
    chat_id TEXT PRIMARY KEY,admin_id UUID NOT NULL REFERENCES km_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW())`);
  await database().query(`CREATE TABLE IF NOT EXISTS km_tg_admin_pair_tokens(
    token_hash TEXT PRIMARY KEY,admin_id UUID NOT NULL REFERENCES km_users(id),
    expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ)`);
  await database().query(`CREATE TABLE IF NOT EXISTS km_tg_pair_tokens(
    token_hash TEXT PRIMARY KEY,agent_id UUID NOT NULL REFERENCES km_users(id),
    referral_code_id UUID NOT NULL REFERENCES km_referral_codes(id),
    expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ)`);
  await database().query(`CREATE TABLE IF NOT EXISTS km_tg_deliveries(
    event_id UUID NOT NULL,chat_id TEXT NOT NULL,sent_at TIMESTAMPTZ,
    attempts INT NOT NULL DEFAULT 0,PRIMARY KEY(event_id,chat_id))`);
  await database().query(`CREATE TABLE IF NOT EXISTS km_tg_events(
    id UUID PRIMARY KEY,member_id UUID NOT NULL REFERENCES km_users(id),
    kind TEXT NOT NULL,details TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,attempts INT NOT NULL DEFAULT 0)`);
 })().catch(e=>{prepared=undefined;throw e});
 return prepared;
}
const digest=async(value:string)=>{
 const {createHash}=await import("node:crypto");
 return createHash("sha256").update(value).digest("hex");
};
export async function makePairToken(agentId:string,codeId:string){
 await schema();
 const token=randomBytes(24).toString("hex");
 await database().query("INSERT INTO km_tg_pair_tokens(token_hash,agent_id,referral_code_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes')",[await digest(token),agentId,codeId]);
 return token;
}
export async function makeAdminPairToken(adminId:string){
 await schema();const token=randomBytes(24).toString("hex");
 await database().query("INSERT INTO km_tg_admin_pair_tokens(token_hash,admin_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')",[await digest(token),adminId]);
 return token;
}
export async function consumeAdminPairToken(token:string,chat:string){
 if(!/^[a-f0-9]{48}$/.test(token)||!/^[-]?[0-9]{1,20}$/.test(chat))return false;
 await schema();
 const c=await database().connect();
 try{await c.query("BEGIN");
  const found=(await c.query(`SELECT p.admin_id FROM km_tg_admin_pair_tokens p
  JOIN km_admin_roles a ON a.user_id=p.admin_id
  WHERE p.token_hash=$1 AND p.used_at IS NULL AND p.expires_at>NOW()
  FOR UPDATE OF p`,[await digest(token)])).rows[0];
  if(!found){await c.query("ROLLBACK");return false}
  await c.query("UPDATE km_tg_admin_pair_tokens SET used_at=NOW() WHERE token_hash=$1",[await digest(token)]);
  await c.query("INSERT INTO km_tg_admin_chats(chat_id,admin_id) VALUES($1,$2) ON CONFLICT(chat_id) DO UPDATE SET admin_id=EXCLUDED.admin_id",[chat,found.admin_id]);
  await c.query("COMMIT");return true;
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
}
export async function consumePairToken(token:string,chat:string){
 if(!/^[a-f0-9]{48}$/.test(token)||!/^[-]?[0-9]{1,20}$/.test(chat))return false;
 await schema();
 const c=await database().connect();
 try{
  await c.query("BEGIN");
  const x=(await c.query(`SELECT p.agent_id,p.referral_code_id FROM km_tg_pair_tokens p
   JOIN km_referral_codes r ON r.id=p.referral_code_id
   JOIN km_organization_members m ON m.user_id=p.agent_id AND m.organization_id=r.organization_id
   JOIN km_organizations o ON o.id=r.organization_id
   LEFT JOIN km_organizations parent ON parent.id=o.parent_id
   WHERE p.token_hash=$1 AND p.used_at IS NULL AND p.expires_at>NOW()
    AND r.agent_id=p.agent_id AND r.status='ACTIVE'
    AND m.status='ACTIVE' AND o.status='ACTIVE' AND (parent.status IS NULL OR parent.status='ACTIVE')
   FOR UPDATE OF p`,[await digest(token)])).rows[0];
  if(!x){await c.query("ROLLBACK");return false}
  await c.query("UPDATE km_tg_pair_tokens SET used_at=NOW() WHERE token_hash=$1",[await digest(token)]);
  await c.query(`INSERT INTO km_tg_subscriptions(chat_id,agent_id,referral_code_id) VALUES($1,$2,$3)
   ON CONFLICT(chat_id,referral_code_id) DO UPDATE SET agent_id=EXCLUDED.agent_id`,[chat,x.agent_id,x.referral_code_id]);
  await c.query("COMMIT");return true;
 }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
}
async function send(chat:string,txt:string){
 const token=process.env.HFM_TELEGRAM_BOT_TOKEN;
 if(!token)return false;
 try{
  const res=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({chat_id:chat,text:txt,disable_web_page_preview:true}),signal:AbortSignal.timeout(4500)});
  return res.ok;
 }catch{return false}
}
export async function botReply(chat:string,text:string){return send(chat,text)}
export async function enqueueAlert(id:string,member:string,kind:string,details:string){
 try{
  await schema();
  await database().query(`INSERT INTO km_tg_events(id,member_id,kind,details)
    VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING`,[id,member,kind,details.slice(0,800)]);
  // Cron handles delivery independently of member request completion.
 }catch(e){console.error("HFM_ALERT_ENQUEUE_FAILED",e instanceof Error?e.message:String(e))}
}
export async function deliverAlerts(){
 if(!process.env.HFM_TELEGRAM_BOT_TOKEN)return {sent:0};
 await schema();let sent=0;
 // Every subscribed chat has its own delivery checkpoint; never drop additional agents.
 const rows=(await database().query(`SELECT e.id,e.kind,e.details,u.username,r.code,s.chat_id
 FROM km_tg_events e JOIN km_users u ON u.id=e.member_id
 JOIN km_member_attributions a ON a.user_id=e.member_id
 JOIN km_referral_codes r ON r.id=a.referral_code_id AND r.status='ACTIVE'
 JOIN km_tg_subscriptions s ON s.referral_code_id=r.id AND s.agent_id=r.agent_id
 JOIN km_organization_members m ON m.user_id=s.agent_id AND m.organization_id=r.organization_id AND m.status='ACTIVE'
 JOIN km_organizations o ON o.id=r.organization_id AND o.status='ACTIVE'
 LEFT JOIN km_organizations parent ON parent.id=o.parent_id
 LEFT JOIN km_tg_deliveries d ON d.event_id=e.id AND d.chat_id=s.chat_id
 WHERE e.created_at>NOW()-INTERVAL '7 days' AND(d.sent_at IS NULL)
 AND COALESCE(d.attempts,0)<6 AND s.created_at<=e.created_at AND(parent.status IS NULL OR parent.status='ACTIVE')
 ORDER BY e.created_at ASC LIMIT 30`)).rows;
 const adminRows=(await database().query(`SELECT e.id,e.kind,e.details,u.username,s.chat_id
 FROM km_tg_events e JOIN km_users u ON u.id=e.member_id
 CROSS JOIN km_tg_admin_chats s
 JOIN km_admin_roles a ON a.user_id=s.admin_id
 LEFT JOIN km_tg_deliveries d ON d.event_id=e.id AND d.chat_id=s.chat_id
 WHERE e.created_at>NOW()-INTERVAL '7 days' AND d.sent_at IS NULL
 AND COALESCE(d.attempts,0)<6 AND s.created_at<=e.created_at ORDER BY e.created_at ASC LIMIT 30`)).rows;
 rows.push(...adminRows.map((x:{id:string;kind:string;details:string;username:string;chat_id:string})=>({...x,code:"전체 관리자"})));
 for(const e of rows){
  const ok=await send(e.chat_id,"[HFM KOREA] "+e.kind+"\\n담당코드: "+e.code+"\\n회원: "+e.username+"\\n"+e.details);
  await database().query(`INSERT INTO km_tg_deliveries(event_id,chat_id,attempts,sent_at)
    VALUES($1,$2,1,CASE WHEN $3 THEN NOW() ELSE NULL END)
    ON CONFLICT(event_id,chat_id) DO UPDATE SET attempts=km_tg_deliveries.attempts+1,
    sent_at=CASE WHEN $3 THEN NOW() ELSE km_tg_deliveries.sent_at END`,[e.id,e.chat_id,ok]);
  if(ok)sent++;
 }
 return {sent};
}
