import {database} from "@/lib/auth";
export type RestrictionField="stock_trading_blocked"|"cfd_trading_blocked"|"deposits_withdrawals_blocked"|"login_blocked";
export type Restrictions=Record<RestrictionField,boolean>;
export const restrictionFields:RestrictionField[]=["stock_trading_blocked","cfd_trading_blocked","deposits_withdrawals_blocked","login_blocked"];
let setup:Promise<void>|null=null;
export async function ensureRestrictions(){
 if(!setup)setup=(async()=>{
 await database().query("ALTER TABLE km_users ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT FALSE");
 await database().query(`CREATE TABLE IF NOT EXISTS km_member_restrictions(user_id UUID PRIMARY KEY REFERENCES km_users(id),stock_trading_blocked BOOLEAN NOT NULL DEFAULT FALSE,cfd_trading_blocked BOOLEAN NOT NULL DEFAULT FALSE,deposits_withdrawals_blocked BOOLEAN NOT NULL DEFAULT FALSE,login_blocked BOOLEAN NOT NULL DEFAULT FALSE,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_by UUID REFERENCES km_users(id))`);
 await database().query(`CREATE TABLE IF NOT EXISTS km_member_restriction_logs(id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES km_users(id),admin_id UUID NOT NULL REFERENCES km_users(id),previous_state JSONB NOT NULL,new_state JSONB NOT NULL,reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await database().query(`INSERT INTO km_member_restrictions(user_id,stock_trading_blocked,cfd_trading_blocked,deposits_withdrawals_blocked,login_blocked)
 SELECT id,TRUE,TRUE,TRUE,TRUE FROM km_users WHERE frozen=TRUE ON CONFLICT(user_id) DO NOTHING`);
 })().catch(e=>{setup=null;throw e});
 await setup;
}
export async function getRestrictions(userId:string):Promise<Restrictions>{
 await ensureRestrictions();
 const r=await database().query("SELECT stock_trading_blocked,cfd_trading_blocked,deposits_withdrawals_blocked,login_blocked FROM km_member_restrictions WHERE user_id=$1",[userId]);
 const v=r.rows[0]||{};return {stock_trading_blocked:!!v.stock_trading_blocked,cfd_trading_blocked:!!v.cfd_trading_blocked,deposits_withdrawals_blocked:!!v.deposits_withdrawals_blocked,login_blocked:!!v.login_blocked};
}
