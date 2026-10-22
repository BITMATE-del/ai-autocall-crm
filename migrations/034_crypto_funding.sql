-- K-MARKETS isolated USDT funding; additive, no changes to KRW ledger.
CREATE TABLE IF NOT EXISTS km_crypto_wallets (
 user_id UUID PRIMARY KEY REFERENCES km_users(id), balance_usdt NUMERIC(24,8) NOT NULL DEFAULT 0 CHECK(balance_usdt>=0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS km_crypto_requests (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES km_users(id),
 kind TEXT NOT NULL CHECK(kind IN ('DEPOSIT','WITHDRAW')),
 network TEXT NOT NULL CHECK(network IN ('TRC20','ERC20')),
 amount_usdt NUMERIC(24,8) NOT NULL CHECK(amount_usdt>=1 AND amount_usdt<=1000000),
 address TEXT NOT NULL, tx_hash TEXT,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ,reviewed_by UUID REFERENCES km_users(id),admin_note TEXT,
 CONSTRAINT crypto_tx_required_for_approval CHECK(status<>'APPROVED' OR (tx_hash IS NOT NULL AND length(tx_hash)>0))
);
CREATE UNIQUE INDEX IF NOT EXISTS km_crypto_tx_unique ON km_crypto_requests(network,lower(tx_hash)) WHERE tx_hash IS NOT NULL AND status='APPROVED';
CREATE INDEX IF NOT EXISTS km_crypto_member_idx ON km_crypto_requests(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS km_crypto_ledger (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES km_users(id),
 request_id UUID NOT NULL UNIQUE REFERENCES km_crypto_requests(id),
 delta_usdt NUMERIC(24,8) NOT NULL,kind TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
