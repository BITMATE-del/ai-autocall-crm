import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database,init} from "@/lib/auth";
import {actorFor} from "@/lib/org-access";
import {ensureCFDCorrectionAuditImmutable} from "@/lib/cfd-correction-audit";
export const dynamic="force-dynamic";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
async function actor(){const u=await currentUser();if(!u?.id)return null;const a=await actorFor(u.id);return a?.active&&a.role!=="ADMIN"&&a.org?a:null}
async function ensure(){await init();await database().query(`CREATE TABLE IF NOT EXISTS km_cfd_correction_requests(
 id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES km_users(id),order_id UUID NOT NULL REFERENCES km_cfd_orders(id),
 requested_by UUID NOT NULL REFERENCES km_users(id),requested_result TEXT NOT NULL CHECK(requested_result IN ('AUTO','WIN','LOSS','VOID')),
 reason TEXT NOT NULL,evidence TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','REJECTED','APPROVED')),
 decided_by UUID REFERENCES km_users(id),decision_reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),decided_at TIMESTAMPTZ,
 original_result TEXT,original_payout_krw BIGINT,original_exit_price NUMERIC(24,10),verified_price NUMERIC(24,10),verified_source TEXT,adjustment_krw BIGINT,
 CONSTRAINT km_cfd_correction_reason_length CHECK(length(reason) BETWEEN 10 AND 2000),
 CONSTRAINT km_cfd_correction_evidence_length CHECK(length(evidence) BETWEEN 10 AND 4000)
)`);await database().query("ALTER TABLE km_cfd_correction_requests ADD COLUMN IF NOT EXISTS verified_price NUMERIC(24,10), ADD COLUMN IF NOT EXISTS verified_source TEXT, ADD COLUMN IF NOT EXISTS adjustment_krw BIGINT");
await database().query("CREATE UNIQUE INDEX IF NOT EXISTS km_cfd_one_pending_correction ON km_cfd_correction_requests(order_id) WHERE status='PENDING'");await database().query(`CREATE TABLE IF NOT EXISTS km_cfd_correction_audit(
 id UUID PRIMARY KEY,request_id UUID NOT NULL REFERENCES km_cfd_correction_requests(id),
 actor_id UUID NOT NULL REFERENCES km_users(id),event TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);await ensureCFDCorrectionAuditImmutable()}
// Referral ownership is looked up from the signed actor. Never accept the partner or code from client input.
const scope=`EXISTS (SELECT 1 FROM km_member_attributions m JOIN km_referral_codes rc ON rc.id=m.referral_code_id JOIN km_organizations ro ON ro.id=rc.organization_id WHERE m.user_id=o.user_id AND (
 ($2='AGENT' AND rc.agent_id=$1) OR ($2='SUB_HQ' AND (ro.parent_id=$3 OR ro.id=$3))
))`;
export async function GET(req:Request){const a=await actor();if(!a)return fail("FORBIDDEN",403);const u=new URL(req.url),q=(u.searchParams.get("q")||"").trim().slice(0,90);try{await ensure();const r=await database().query(`SELECT o.id,o.user_id,u.username,u.email,o.symbol,o.direction,o.amount_krw,o.entry_price,o.exit_price,o.result,o.payout_krw,o.status,o.created_at,o.expires_at,(SELECT json_build_object('id',cr.id,'status',cr.status,'requested_result',cr.requested_result,'reason',cr.reason,'created_at',cr.created_at) FROM km_cfd_correction_requests cr WHERE cr.order_id=o.id ORDER BY cr.created_at DESC LIMIT 1) AS correction FROM km_cfd_orders o JOIN km_users u ON u.id=o.user_id WHERE ${scope} AND ($4='' OR o.id::text ILIKE '%'||$4||'%' OR u.username ILIKE '%'||$4||'%' OR o.symbol ILIKE '%'||$4||'%') ORDER BY o.created_at DESC LIMIT 100`,[a.id,a.role,a.org,q]);return NextResponse.json({orders:r.rows},{headers:{"Cache-Control":"no-store"}})}catch(e){console.error("PARTNER_CFD_CORRECTIONS_READ_FAILED",e);return fail("CORRECTIONS_UNAVAILABLE",503)}}
export async function POST(req:Request){const a=await actor();if(!a)return fail("FORBIDDEN",403);const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();if(!origin||new URL(origin).host!==host)return fail("INVALID_ORIGIN",403);
let b:{orderId?:string;requestedResult?:string;reason?:string;evidence?:string};try{b=await req.json()}catch{return fail("INVALID_JSON")}
const id=String(b.orderId||""),requested=String(b.requestedResult||""),reason=String(b.reason||"").trim(),evidence=String(b.evidence||"").trim();
if(!uuid.test(id)||!["AUTO","WIN","LOSS","VOID"].includes(requested)||reason.length<10||reason.length>2000||evidence.length<10||evidence.length>4000)return fail("INVALID_INPUT");
try{await ensure();const c=await database().connect();try{await c.query("BEGIN");const o=(await c.query(`SELECT o.* FROM km_cfd_orders o WHERE o.id=$4 AND ${scope} FOR UPDATE OF o`,[a.id,a.role,a.org,id])).rows[0];if(!o){await c.query("ROLLBACK");return fail("ORDER_OUT_OF_SCOPE",403)}if(o.status!=="SETTLED"){await c.query("ROLLBACK");return fail("ORDER_NOT_SETTLED",409)}
const requestId=randomUUID();await c.query("INSERT INTO km_cfd_correction_requests(id,user_id,order_id,requested_by,requested_result,reason,evidence,original_result,original_payout_krw,original_exit_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[requestId,o.user_id,o.id,a.id,requested,reason,evidence,o.result,o.payout_krw,o.exit_price]);
await c.query("INSERT INTO km_cfd_correction_audit(id,request_id,actor_id,event,payload) VALUES($1,$2,$3,'PARTNER_REQUEST_CREATED',$4::jsonb)",[randomUUID(),requestId,a.id,JSON.stringify({orderId:id,originalResult:o.result,requestedResult:requested,originalPayout:o.payout_krw,reason,evidence})]);await c.query("COMMIT");return NextResponse.json({ok:true,id:requestId,status:"PENDING",financialEffect:false},{status:201})}catch(e){await c.query("ROLLBACK");if((e as {code?:string}).code==="23505")return fail("PENDING_REQUEST_EXISTS",409);throw e}finally{c.release()}}catch(e){console.error("PARTNER_CFD_CORRECTIONS_REQUEST_FAILED",e);return fail("REQUEST_UNAVAILABLE",503)}}
