BEGIN;
-- Financially non-posting performance snapshots. Never debit member deposits or credit operator wallets.
CREATE TABLE IF NOT EXISTS km_deposit_share_policies(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES km_organizations(id),
 sub_hq_rate_bps INTEGER NOT NULL CHECK(sub_hq_rate_bps BETWEEN 0 AND 10000),
 min_rate_bps INTEGER NOT NULL CHECK(min_rate_bps BETWEEN 0 AND 10000),
 max_rate_bps INTEGER NOT NULL CHECK(max_rate_bps BETWEEN 0 AND 10000),
 allow_agent_override BOOLEAN NOT NULL DEFAULT FALSE,
 effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_by UUID NOT NULL REFERENCES km_users(id),
 reason TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK(min_rate_bps<=sub_hq_rate_bps AND sub_hq_rate_bps<=max_rate_bps)
);
CREATE INDEX IF NOT EXISTS km_dsp_org_effective ON km_deposit_share_policies(organization_id,effective_at DESC);
CREATE TABLE IF NOT EXISTS km_deposit_share_records(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 source_kind TEXT NOT NULL CHECK(source_kind IN ('KRW','BLOCKCHAIN')),
 source_id TEXT NOT NULL,
 member_id UUID NOT NULL REFERENCES km_users(id),
 agent_id UUID NOT NULL REFERENCES km_users(id),
 agent_org_id UUID NOT NULL REFERENCES km_organizations(id),
 sub_hq_id UUID NOT NULL REFERENCES km_organizations(id),
 deposit_amount_krw BIGINT NOT NULL CHECK(deposit_amount_krw>0),
 original_asset TEXT NOT NULL,
 original_amount NUMERIC(30,12),
 exchange_rate NUMERIC(30,12) NOT NULL CHECK(exchange_rate>0),
 sub_hq_rate_bps INTEGER NOT NULL CHECK(sub_hq_rate_bps BETWEEN 0 AND 10000),
 agent_rate_bps INTEGER NOT NULL CHECK(agent_rate_bps BETWEEN 0 AND 10000),
 sub_hq_base_krw BIGINT NOT NULL CHECK(sub_hq_base_krw>=0),
 agent_base_krw BIGINT NOT NULL CHECK(agent_base_krw>=0),
 confirmed_at TIMESTAMPTZ NOT NULL,
 calculation_status TEXT NOT NULL DEFAULT 'CALCULATED' CHECK(calculation_status IN ('CALCULATED','REVERSED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(source_kind,source_id),
 CHECK(sub_hq_rate_bps+agent_rate_bps=10000),
 CHECK(sub_hq_base_krw+agent_base_krw=deposit_amount_krw)
);
CREATE INDEX IF NOT EXISTS km_dsr_sub_time ON km_deposit_share_records(sub_hq_id,confirmed_at DESC);
CREATE INDEX IF NOT EXISTS km_dsr_agent_time ON km_deposit_share_records(agent_org_id,confirmed_at DESC);
CREATE TABLE IF NOT EXISTS km_deposit_share_adjustments(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id UUID NOT NULL REFERENCES km_deposit_share_records(id),
 reason TEXT NOT NULL,
 actor_id UUID NOT NULL REFERENCES km_users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;
