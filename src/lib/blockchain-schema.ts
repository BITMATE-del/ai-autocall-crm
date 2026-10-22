import {database,init} from "@/lib/auth";
/** Additive, idempotent blockchain schema bootstrap. No balances or historic requests are mutated. */
let task:Promise<void>|undefined;
export async function ensureBlockchainSchema(){
 if(!task)task=(async()=>{
  await init();
  const c=await database().connect();
  try{
   await c.query("SELECT pg_advisory_lock(82110534)");
   try{
    await c.query(`CREATE TABLE IF NOT EXISTS km_crypto_requests(
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL REFERENCES km_users(id),
     kind TEXT NOT NULL CHECK(kind IN ('DEPOSIT','WITHDRAW')),
     network TEXT NOT NULL CHECK(network IN ('TRC20','ERC20')),
     amount_usdt NUMERIC(24,8) NOT NULL CHECK(amount_usdt>=1 AND amount_usdt<=1000000),
     address TEXT NOT NULL, tx_hash TEXT,
     status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     reviewed_at TIMESTAMPTZ,reviewed_by UUID REFERENCES km_users(id),admin_note TEXT
    )`);
    await c.query("ALTER TABLE km_crypto_requests ADD COLUMN IF NOT EXISTS amount_krw BIGINT");
    await c.query("ALTER TABLE km_crypto_requests ADD COLUMN IF NOT EXISTS rate_krw_per_usdt BIGINT");
    await c.query("ALTER TABLE km_crypto_requests ADD COLUMN IF NOT EXISTS funding_version INTEGER NOT NULL DEFAULT 1");
    await c.query("CREATE UNIQUE INDEX IF NOT EXISTS km_crypto_tx_unique ON km_crypto_requests(network,lower(tx_hash)) WHERE tx_hash IS NOT NULL AND status='APPROVED'");
    await c.query("CREATE INDEX IF NOT EXISTS km_crypto_member_idx ON km_crypto_requests(user_id,created_at DESC)");
    await c.query(`CREATE TABLE IF NOT EXISTS km_blockchain_settings(
     id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),
     krw_per_usdt BIGINT NOT NULL CHECK(krw_per_usdt>0),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_by UUID REFERENCES km_users(id)
    )`);
   }finally{await c.query("SELECT pg_advisory_unlock(82110534)")}
  }finally{c.release()}
 })().catch(e=>{task=undefined;throw e});
 await task;
}
