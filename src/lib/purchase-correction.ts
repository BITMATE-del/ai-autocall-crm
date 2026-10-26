import {database} from "@/lib/auth";
export async function ensurePurchaseCorrectionSchema(){
 await database().query("CREATE TABLE IF NOT EXISTS km_cfd_order_input_records(order_id UUID PRIMARY KEY REFERENCES km_cfd_orders(id),requested_amount_krw BIGINT NOT NULL CHECK(requested_amount_krw>0),recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await database().query("CREATE TABLE IF NOT EXISTS km_purchase_correction_audit(id UUID PRIMARY KEY,user_id UUID NOT NULL,trade_id UUID NOT NULL,kind TEXT NOT NULL,old_amount BIGINT NOT NULL,new_amount BIGINT NOT NULL,actor_id UUID NOT NULL,old_balance BIGINT,new_balance BIGINT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");

 await database().query("CREATE OR REPLACE FUNCTION km_purchase_audit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_PURCHASE_AUDIT'; END; $$");
 await database().query("DROP TRIGGER IF EXISTS km_purchase_audit_immutable ON km_purchase_correction_audit");
 await database().query("CREATE TRIGGER km_purchase_audit_immutable BEFORE UPDATE OR DELETE ON km_purchase_correction_audit FOR EACH ROW EXECUTE FUNCTION km_purchase_audit_guard()");
}
