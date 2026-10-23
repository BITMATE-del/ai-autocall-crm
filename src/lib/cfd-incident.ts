import {database} from "@/lib/auth";
export async function ensureIncidentSchema(){await database().query(`CREATE TABLE IF NOT EXISTS km_cfd_verified_incidents(
 id UUID PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('FEED_OUTAGE','SETTLEMENT_FAILURE','EXECUTION_ERROR')),
 symbol TEXT NOT NULL,start_at TIMESTAMPTZ NOT NULL,end_at TIMESTAMPTZ NOT NULL,
 evidence TEXT NOT NULL,reported_by UUID NOT NULL REFERENCES km_users(id),
 reviewed_by UUID REFERENCES km_users(id),review_note TEXT,reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(end_at>start_at),CHECK(length(evidence)>=30),
 CHECK((reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
)`)}
