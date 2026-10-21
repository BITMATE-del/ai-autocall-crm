BEGIN;
ALTER TABLE km_deposit_share_adjustments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'REVERSAL';
CREATE UNIQUE INDEX IF NOT EXISTS km_deposit_share_one_reversal ON km_deposit_share_adjustments(record_id) WHERE kind='REVERSAL';
CREATE INDEX IF NOT EXISTS km_dsr_source_member ON km_deposit_share_records(source_kind,source_id,member_id);
COMMIT;