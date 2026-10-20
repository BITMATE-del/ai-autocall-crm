import {Pool} from "pg";
import bcrypt from "bcryptjs";
import {SignJWT,jwtVerify} from "jose";
import {cookies} from "next/headers";
import {createCipheriv,createHash,randomBytes} from "node:crypto";

const secret=()=>{const v=process.env.SESSION_SECRET;if(!v||v.length<32)throw new Error("Session config missing");return new TextEncoder().encode(v)};
const cipherKey=()=>{const v=process.env.ACCOUNT_ENCRYPTION_KEY;if(!v||v.length<32)throw new Error("Encryption config missing");return createHash("sha256").update(v).digest()};
export function seal(data:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",cipherKey(),iv);const body=Buffer.concat([cipher.update(data,"utf8"),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString("base64")}
let pool:Pool|undefined;export function database(){const url=process.env.DATABASE_URL;if(!url)throw new Error("Database config missing");return pool??(pool=new Pool({connectionString:url,max:6,connectionTimeoutMillis:7000}))}
let started:Promise<void>|undefined;
export async function init(){if(!started)started=(async()=>{await database().query("CREATE TABLE IF NOT EXISTS km_users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),email TEXT NOT NULL UNIQUE,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");await database().query("CREATE TABLE IF NOT EXISTS km_member_profiles(user_id UUID PRIMARY KEY REFERENCES km_users(id) ON DELETE CASCADE,legal_name TEXT NOT NULL,birth_date DATE NOT NULL,phone_ciphertext TEXT NOT NULL,referral TEXT,bank TEXT NOT NULL,account_ciphertext TEXT NOT NULL,account_holder TEXT NOT NULL,bank_verified BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())")})().catch(e=>{started=undefined;throw e});await started}
export type Signup={username:string;password:string;legalName:string;birthDate:string;phone:string;referral:string;bank:string;account:string;holder:string};
export async function register(input:Signup){await init();const passwordHash=await bcrypt.hash(input.password,12),phone=seal(input.phone),account=seal(input.account);const client=await database().connect();try{await client.query("BEGIN");const r=await client.query("INSERT INTO km_users(email,username,password_hash) VALUES($1,$2,$3) RETURNING id,username",[input.username.toLowerCase()+"@local.kmarkets.invalid",input.username,passwordHash]);const u=r.rows[0];await client.query("INSERT INTO km_member_profiles(user_id,legal_name,birth_date,phone_ciphertext,referral,bank,account_ciphertext,account_holder) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[u.id,input.legalName,input.birthDate,phone,input.referral||null,input.bank,account,input.holder]);await client.query("COMMIT");return u}catch(e){await client.query("ROLLBACK");throw e}finally{client.release()}}
export async function authenticate(username:string,password:string){await init();const r=await database().query("SELECT id,username,password_hash FROM km_users WHERE username=$1",[username]);const u=r.rows[0];if(!u||!(await bcrypt.compare(password,u.password_hash)))return null;return {id:u.id,username:u.username}}
export async function createSession(u:{id:string;username:string}){const token=await new SignJWT({username:u.username}).setProtectedHeader({alg:"HS256"}).setSubject(u.id).setIssuedAt().setExpirationTime("7d").sign(secret());(await cookies()).set("km_session",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:604800})}
export async function currentUser(){try{const token=(await cookies()).get("km_session")?.value;if(!token)return null;const {payload}=await jwtVerify(token,secret());return {id:payload.sub,username:String(payload.username||"")}}catch{return null}}
export async function logout(){(await cookies()).delete("km_session")}

/** Shared PostgreSQL-backed throttling across all Railway instances. */
export async function throttle(scope:string,identifier:string,limit:number,windowSeconds:number){
 await init();
 await database().query("CREATE TABLE IF NOT EXISTS km_auth_rate_limits(key_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,reset_at TIMESTAMPTZ NOT NULL)");
 const digest=createHash("sha256").update(scope+":"+identifier).digest("hex");
 const result=await database().query(
 "INSERT INTO km_auth_rate_limits(key_hash,attempts,reset_at) VALUES($1,1,NOW()+($2 * INTERVAL '1 second')) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN km_auth_rate_limits.reset_at<=NOW() THEN 1 ELSE km_auth_rate_limits.attempts+1 END,reset_at=CASE WHEN km_auth_rate_limits.reset_at<=NOW() THEN NOW()+($2 * INTERVAL '1 second') ELSE km_auth_rate_limits.reset_at END RETURNING attempts,EXTRACT(EPOCH FROM (reset_at-NOW())) AS wait",
 [digest,windowSeconds]);
 return {allowed:Number(result.rows[0].attempts)<=limit,retryAfter:Math.max(1,Math.ceil(Number(result.rows[0].wait)))};
}
