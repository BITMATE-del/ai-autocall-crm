import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database,isAdmin} from "@/lib/auth";
export const dynamic="force-dynamic";
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
async function who(){const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return null;const r=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[u.id]);return r.rows[0]?.role==="SUPER_ADMIN"?u:null}
export async function ensureIncidentSchema(){await database().query(`CREATE TABLE IF NOT EXISTS km_cfd_verified_incidents(
 id UUID PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('FEED_OUTAGE','SETTLEMENT_FAILURE','EXECUTION_ERROR')),
 symbol TEXT NOT NULL,start_at TIMESTAMPTZ NOT NULL,end_at TIMESTAMPTZ NOT NULL,
 evidence TEXT NOT NULL,reported_by UUID NOT NULL REFERENCES km_users(id),
 reviewed_by UUID REFERENCES km_users(id),review_note TEXT,reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(end_at>start_at),CHECK(length(evidence)>=30),
 CHECK((reviewed_by IS NULL AND reviewed_at IS NULL) OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
)`)}
function validOrigin(req:Request){const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();try{return !!origin&&new URL(origin).host===host}catch{return false}}
export async function GET(){const u=await who().catch(()=>null);if(!u)return fail("FORBIDDEN",403);try{await ensureIncidentSchema();const r=await database().query("SELECT i.*,a.username AS reporter,b.username AS reviewer FROM km_cfd_verified_incidents i JOIN km_users a ON a.id=i.reported_by LEFT JOIN km_users b ON b.id=i.reviewed_by ORDER BY i.created_at DESC LIMIT 100");return NextResponse.json({incidents:r.rows},{headers:{"Cache-Control":"no-store"}})}catch{return fail("INCIDENT_LIST_FAILED",503)}}
export async function POST(req:Request){const u=await who().catch(()=>null);if(!u)return fail("FORBIDDEN",403);if(!validOrigin(req))return fail("INVALID_ORIGIN",403);const b=await req.json().catch(()=>null);if(!b)return fail("INVALID_JSON");const kind=String(b.kind||""),symbol=String(b.symbol||"").trim(),evidence=String(b.evidence||"").trim(),start=Date.parse(String(b.startAt||"")),end=Date.parse(String(b.endAt||""));if(!["FEED_OUTAGE","SETTLEMENT_FAILURE","EXECUTION_ERROR"].includes(kind)||!/^[A-Z0-9]{3,24}$/.test(symbol)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>86400000||start>Date.now()||evidence.length<30||evidence.length>4000)return fail("INVALID_INCIDENT");try{await ensureIncidentSchema();const id=randomUUID();await database().query("INSERT INTO km_cfd_verified_incidents(id,kind,symbol,start_at,end_at,evidence,reported_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,kind,symbol,new Date(start),new Date(end),evidence,u.id]);return NextResponse.json({id,status:"REVIEW_PENDING"},{status:201})}catch{return fail("INCIDENT_CREATE_FAILED",503)}}
export async function PATCH(req:Request){const u=await who().catch(()=>null);if(!u)return fail("FORBIDDEN",403);if(!validOrigin(req))return fail("INVALID_ORIGIN",403);const b=await req.json().catch(()=>null),id=String(b?.id||""),note=String(b?.note||"").trim();if(!/^[0-9a-f-]{36}$/i.test(id)||note.length<20||note.length>2000)return fail("INVALID_INPUT");try{await ensureIncidentSchema();const r=await database().query("UPDATE km_cfd_verified_incidents SET reviewed_by=$2,reviewed_at=NOW(),review_note=$3 WHERE id=$1 AND reviewed_by IS NULL AND reported_by<>$2 RETURNING id",[id,u.id,note]);if(!r.rowCount)return fail("INDEPENDENT_REVIEW_REQUIRED",409);return NextResponse.json({ok:true})}catch{return fail("INCIDENT_REVIEW_FAILED",503)}}
