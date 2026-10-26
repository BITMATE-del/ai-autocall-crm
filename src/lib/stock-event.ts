import {database} from "@/lib/auth";
let ready:Promise<void>|undefined;
export async function ensureStockEventSchema(){
 if(!ready)ready=(async()=>{
 await database().query(`CREATE TABLE IF NOT EXISTS km_stock_event_grants(
 id UUID PRIMARY KEY,event_key TEXT NOT NULL,event_name TEXT NOT NULL,
 user_id UUID NOT NULL REFERENCES km_users(id),symbol TEXT NOT NULL CHECK(symbol ~ '^[0-9]{6}$'),
 granted_qty BIGINT NOT NULL CHECK(granted_qty>0),available_qty BIGINT NOT NULL CHECK(available_qty>=0 AND available_qty<=granted_qty),
 asset_type TEXT NOT NULL DEFAULT 'SIMULATED_STOCK' CHECK(asset_type='SIMULATED_STOCK'),
 granted_by UUID NOT NULL REFERENCES km_users(id),granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(event_key,user_id,symbol))`);
 await database().query(`CREATE TABLE IF NOT EXISTS km_stock_event_movements(
 id UUID PRIMARY KEY,grant_id UUID NOT NULL REFERENCES km_stock_event_grants(id),user_id UUID NOT NULL REFERENCES km_users(id),
 symbol TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('GRANT','SELL_CONSUME','REVERSAL')),
 qty_delta BIGINT NOT NULL CHECK(qty_delta<>0),actor_id UUID REFERENCES km_users(id),
 reference_id UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await database().query("CREATE UNIQUE INDEX IF NOT EXISTS km_stock_event_reversal_unique ON km_stock_event_movements(grant_id) WHERE kind='REVERSAL'");
 await database().query(`CREATE OR REPLACE FUNCTION km_stock_event_movement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EVENT_MOVEMENT_IMMUTABLE'; END; $$`);
 await database().query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='km_stock_event_movement_guard' AND tgrelid='km_stock_event_movements'::regclass) THEN CREATE TRIGGER km_stock_event_movement_guard BEFORE UPDATE OR DELETE ON km_stock_event_movements FOR EACH ROW EXECUTE FUNCTION km_stock_event_movement_immutable(); END IF; END $$`);
 })().catch(e=>{ready=undefined;throw e});
 await ready;
}
