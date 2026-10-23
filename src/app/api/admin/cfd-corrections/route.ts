import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database,isAdmin,init} from "@/lib/auth";
export const dynamic="force-dynamic";
const denied=()=>NextResponse.json({error:"FORBIDDEN"},{status:403});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function setup(){await init();await database().query(`CREATE TABLE IF NOT EXISTS km_cfd_correction_requests(
 id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES km_users(id),order_id UUID NOT NULL REFERENCES km_cfd_orders(id),
 requested_by UUID NOT NULL REFERENCES km_users(id),requested_result TEXT NOT NULL CHECK(requested_result IN ('AUTO','WIN','LOSS','VOID')),
 reason TEXT NOT NULL,evidence TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','REJECTED','APPROVED')),
 decided_by UUID REFERENCES km_users(id),decision_reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),decided_at TIMESTAMPTZ,
 original_result TEXT,original_payout_krw BIGINT,original_exit_price NUMERIC(24,10),
 CONSTRAINT km_cfd_correction_reason_length CHECK(length(reason) BETWEEN 10 AND 2000),
 CONSTRAINT km_cfd_correction_evidence_length CHECK(length(evidence) BETWEEN 10 AND 4000)
)`);
await database().query("CREATE UNIQUE INDEX IF NOT EXISTS km_cfd_one_pending_correction ON km_cfd_correction_requests(order_id) WHERE status='PENDING'");
await database().query(`CREATE TABLE IF NOT EXISTS km_cfd_correction_audit(
 id UUID PRIMARY KEY,request_id UUID NOT NULL REFERENCES km_cfd_correction_requests(id),
 actor_id UUID NOT NULL REFERENCES km_users(id),event TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`);
}
async function auth(){const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return null;return u;}
export async function GET(req:Request){const u=await auth();if(!u)return denied();try{await setup();const url=new URL(req.url),status=url.searchParams.get("status")||"",q=(url.searchParams.get("q")||"").trim().slice(0,90);
if(status&&!["PENDING","REJECTED","APPROVED"].includes(status))return NextResponse.json({error:"INVALID_STATUS"},{status:400});
const r=await database().query(`SELECT o.id,o.user_id,u.username,u.email,o.symbol,o.direction,o.amount_krw,o.entry_price,o.exit_price,o.result,o.payout_krw,o.status,o.created_at,o.expires_at,o.settled_at,
(SELECT json_build_object('id',c.id,'status',c.status,'requested_result',c.requested_result,'reason',c.reason,'evidence',c.evidence,'created_at',c.created_at,'decision_reason',c.decision_reason) FROM km_cfd_correction_requests c WHERE c.order_id=o.id ORDER BY c.created_at DESC LIMIT 1) AS correction
FROM km_cfd_orders o JOIN km_users u ON u.id=o.user_id
WHERE ($1='' OR o.id::text ILIKE '%'||$1||'%' OR u.username ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%' OR o.symbol ILIKE '%'||$1||'%')
AND ($2='' OR EXISTS (SELECT 1 FROM km_cfd_correction_requests c WHERE c.order_id=o.id AND c.status=$2))
ORDER BY o.created_at DESC LIMIT 150`,[q,status]);
return NextResponse.json({orders:r.rows},{headers:{"Cache-Control":"no-store"}})}catch(e){console.error("CFD_CORRECTION_LIST_FAILED",e);return NextResponse.json({error:"CORRECTIONS_UNAVAILABLE"},{status:503})}}
export async function POST(req:Request){const u=await auth();if(!u)return denied();const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();if(!origin||new URL(origin).host!==host)return denied();
let b:{orderId?:string;requestedResult?:string;reason?:string;evidence?:string};try{b=await req.json()}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400})}
const orderId=String(b.orderId||""),requested=String(b.requestedResult||""),reason=String(b.reason||"").trim(),evidence=String(b.evidence||"").trim();
if(!uuid.test(orderId)||!["AUTO","WIN","LOSS","VOID"].includes(requested)||reason.length<10||reason.length>2000||evidence.length<10||evidence.length>4000)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
try{await setup();const c=await database().connect();try{await c.query("BEGIN");const o=(await c.query("SELECT * FROM km_cfd_orders WHERE id=$1 FOR UPDATE",[orderId])).rows[0];
if(!o){await c.query("ROLLBACK");return NextResponse.json({error:"ORDER_NOT_FOUND"},{status:404})}
if(o.status!=="SETTLED"){await c.query("ROLLBACK");return NextResponse.json({error:"ORDER_NOT_SETTLED"},{status:409})}
const id=randomUUID();await c.query(`INSERT INTO km_cfd_correction_requests(id,user_id,order_id,requested_by,requested_result,reason,evidence,original_result,original_payout_krw,original_exit_price)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,o.user_id,orderId,u.id,requested,reason,evidence,o.result,o.payout_krw,o.exit_price]);
await c.query("INSERT INTO km_cfd_correction_audit(id,request_id,actor_id,event,payload) VALUES($1,$2,$3,'REQUEST_CREATED',$4::jsonb)",[randomUUID(),id,u.id,JSON.stringify({orderId,requestedResult:requested,originalResult:o.result,originalPayout:o.payout_krw,reason,evidence})]);
await c.query("COMMIT");return NextResponse.json({ok:true,id,status:"PENDING",financialEffect:false},{status:201})}
catch(e){await c.query("ROLLBACK");if((e as {code?:string}).code==="23505")return NextResponse.json({error:"PENDING_REQUEST_EXISTS"},{status:409});throw e}finally{c.release()}}
catch(e){console.error("CFD_CORRECTION_REQUEST_FAILED",e);return NextResponse.json({error:"REQUEST_UNAVAILABLE"},{status:503})}}
export async function PATCH(req:Request){const u=await auth();if(!u)return denied();const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();if(!origin||new URL(origin).host!==host)return denied();let b:{id?:string;action?:string;reason?:string};try{b=await req.json()}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400})}
const id=String(b.id||""),reason=String(b.reason||"").trim();
if(!uuid.test(id)||b.action!=="REJECT"||reason.length<10||reason.length>2000)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
try{await setup();const c=await database().connect();try{await c.query("BEGIN");const r=await c.query("UPDATE km_cfd_correction_requests SET status='REJECTED',decided_by=$2,decision_reason=$3,decided_at=NOW() WHERE id=$1 AND status='PENDING' RETURNING id",[id,u.id,reason]);if(!r.rowCount){await c.query("ROLLBACK");return NextResponse.json({error:"REQUEST_NOT_PENDING"},{status:409})}await c.query("INSERT INTO km_cfd_correction_audit(id,request_id,actor_id,event,payload) VALUES($1,$2,$3,'REQUEST_REJECTED',$4::jsonb)",[randomUUID(),id,u.id,JSON.stringify({reason})]);await c.query("COMMIT");return NextResponse.json({ok:true})}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}}catch{return NextResponse.json({error:"REJECTION_FAILED"},{status:503})}}
