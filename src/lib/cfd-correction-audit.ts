import {database} from "@/lib/auth";
let promise:Promise<void>|undefined;
/** DB-level append-only protection for CFD correction events. */
export async function ensureCFDCorrectionAuditImmutable(){
 if(!promise)promise=(async()=>{
 const c=await database().connect();
 try{await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(84211258)");
 await c.query(`CREATE OR REPLACE FUNCTION km_prevent_cfd_correction_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'CFD_CORRECTION_AUDIT_IMMUTABLE'; END; $$`);
 await c.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='km_cfd_correction_audit_immutable' AND tgrelid='km_cfd_correction_audit'::regclass) THEN CREATE TRIGGER km_cfd_correction_audit_immutable BEFORE UPDATE OR DELETE ON km_cfd_correction_audit FOR EACH ROW EXECUTE FUNCTION km_prevent_cfd_correction_audit_mutation(); END IF; END $$`);
 await c.query("COMMIT")}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
 })().catch(e=>{promise=undefined;throw e});
 await promise;
}
