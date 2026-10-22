-- Additive unified KRW ledger and integer USDT settlement metadata.
-- Do not migrate or mutate existing separate-asset balances automatically.
ALTER TABLE km_crypto_requests ADD COLUMN IF NOT EXISTS amount_krw BIGINT;
ALTER TABLE km_crypto_requests ADD COLUMN IF NOT EXISTS rate_krw_per_usdt BIGINT;
ALTER TABLE km_crypto_requests ADD COLUMN IF NOT EXISTS funding_version INTEGER NOT NULL DEFAULT 1;
DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_crypto_amount_krw_positive') THEN ALTER TABLE km_crypto_requests ADD CONSTRAINT km_crypto_amount_krw_positive CHECK(amount_krw IS NULL OR amount_krw>0); END IF; END $;
DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='km_crypto_rate_positive') THEN ALTER TABLE km_crypto_requests ADD CONSTRAINT km_crypto_rate_positive CHECK(rate_krw_per_usdt IS NULL OR rate_krw_per_usdt>0); END IF; END $;
CREATE UNIQUE INDEX IF NOT EXISTS km_crypto_ledger_request_id ON km_crypto_ledger(request_id);
CREATE TABLE IF NOT EXISTS km_blockchain_settings (
 id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),
 krw_per_usdt BIGINT NOT NULL CHECK(krw_per_usdt>0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_by UUID REFERENCES km_users(id)
);
CREATE INDEX IF NOT EXISTS km_crypto_status_idx ON km_crypto_requests(status,created_at);
