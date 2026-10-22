import pg from "pg";
import {readFileSync} from "node:fs";
const url=process.env.DATABASE_URL||process.env.database_DATABASE_URL;
if(!url)throw Error("KPRO_DATABASE_ENV_MISSING");
const db=new pg.Client({connectionString:url,connectionTimeoutMillis:10000,statement_timeout:45000});
await db.connect();
try{
 await db.query("SELECT pg_advisory_lock(82110513)");
 try{
  await db.query("CREATE TABLE IF NOT EXISTS km_users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),email TEXT NOT NULL UNIQUE,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE TABLE IF NOT EXISTS km_member_profiles(user_id UUID PRIMARY KEY REFERENCES km_users(id) ON DELETE CASCADE,legal_name TEXT NOT NULL,birth_date DATE NOT NULL,phone_ciphertext TEXT NOT NULL,referral TEXT,bank TEXT NOT NULL,account_ciphertext TEXT NOT NULL,account_holder TEXT NOT NULL,bank_verified BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE TABLE IF NOT EXISTS km_admin_roles(user_id UUID PRIMARY KEY REFERENCES km_users(id),role TEXT NOT NULL DEFAULT 'SUPER_ADMIN',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await db.query("CREATE TABLE IF NOT EXISTS km_funding_requests(id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES km_users(id),kind TEXT NOT NULL CHECK(kind IN ('DEPOSIT','WITHDRAW')),amount_krw BIGINT NOT NULL CHECK(amount_krw>0),status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),reviewed_at TIMESTAMPTZ,reviewed_by UUID REFERENCES km_users(id),admin_note TEXT)");
  for(const n of ["030_org_hierarchy","031_org_commission","032_deposit_share","033_deposit_share_reconciliation","034_crypto_funding","035_unified_blockchain_funding"]){await db.query(readFileSync("migrations/"+n+".sql","utf8"))}
  console.log("KPRO_NEON_SCHEMA_OK");
 }finally{await db.query("SELECT pg_advisory_unlock(82110513)")}
}finally{await db.end()}
