import {ensureRestrictions,restrictionFields} from "@/lib/member-restrictions";
import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database,init,isAdmin} from "@/lib/auth";
export const dynamic="force-dynamic";
async function schema(){await init();await database().query("ALTER TABLE km_users ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT FALSE");await database().query("CREATE TABLE IF NOT EXISTS km_admin_member_audit(id UUID PRIMARY KEY,admin_id UUID NOT NULL REFERENCES km_users(id),member_id UUID NOT NULL REFERENCES km_users(id),action TEXT NOT NULL,detail JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())")}
export async function GET(){const u=await currentUser();if(!u?.id||!(await isAdmin(u.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});try{
 const db=database();
 const info=await db.query("SELECT to_regclass('public.km_krw_wallets') IS NOT NULL AS wallet,EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='km_users' AND column_name='frozen') AS frozen");
 const hasWallet=info.rows[0]?.wallet===true,hasFrozen=info.rows[0]?.frozen===true;
 await ensureRestrictions();
 const result=await db.query("SELECT u.id,u.username,u.created_at,"+(hasFrozen?"u.frozen":"FALSE AS frozen")+",p.legal_name,p.bank,p.account_holder,p.bank_verified,p.referral,"+(hasWallet?"COALESCE(w.balance,0)":"0")+"::bigint AS balance,COALESCE(rest.stock_trading_blocked,FALSE) AS stock_trading_blocked,COALESCE(rest.cfd_trading_blocked,FALSE) AS cfd_trading_blocked,COALESCE(rest.deposits_withdrawals_blocked,FALSE) AS deposits_withdrawals_blocked,COALESCE(rest.login_blocked,FALSE) AS login_blocked FROM km_users u LEFT JOIN km_member_profiles p ON p.user_id=u.id LEFT JOIN km_member_restrictions rest ON rest.user_id=u.id "+(hasWallet?"LEFT JOIN km_krw_wallets w ON w.user_id=u.id ":"")+"ORDER BY u.created_at DESC LIMIT 300");
 return NextResponse.json({members:result.rows.map(x=>({...x,balance:Number(x.balance)}))},{headers:{"Cache-Control":"no-store"}});
 }catch(e){console.error("ADMIN_MEMBERS_READ_FAILED",e instanceof Error?e.message:String(e));return NextResponse.json({error:"MEMBERS_UNAVAILABLE"},{status:503})}}
export async function PATCH(req:Request){const admin=await currentUser();if(!admin?.id||!(await isAdmin(admin.id)))return NextResponse.json({error:"FORBIDDEN"},{status:403});
const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
let b:{id?:string;action?:string;amount?:number;reason?:string;frozen?:boolean;name?:string;bank?:string;holder?:string;referral?:string;restrictions?:Record<string,boolean>};
try{b=await req.json()}catch{return NextResponse.json({error:"INVALID_JSON"},{status:400})}
const id=String(b.id||""),action=String(b.action||""),reason=String(b.reason||"").trim();
if(!/^[0-9a-f-]{36}$/i.test(id)||!["BALANCE","PROFILE","RESTRICTIONS"].includes(action)||reason.length<5||reason.length>300)return NextResponse.json({error:"INVALID_INPUT"},{status:400});
if(id===admin.id)return NextResponse.json({error:"SELF_MODIFICATION_DENIED"},{status:403});
if(action==="BALANCE"&&(!Number.isSafeInteger(b.amount)||!b.amount||Math.abs(b.amount)>100000000))return NextResponse.json({error:"INVALID_AMOUNT"},{status:400});
if(action==="FREEZE"&&typeof b.frozen!=="boolean")return NextResponse.json({error:"INVALID_FREEZE"},{status:400});
const name=String(b.name||"").trim(),bank=String(b.bank||"").trim(),holder=String(b.holder||"").trim(),referral=String(b.referral||"").trim();
if(action==="PROFILE"&&(name.length<2||name.length>50||bank.length<2||bank.length>50||holder.length<2||holder.length>50||referral.length>40))return NextResponse.json({error:"INVALID_PROFILE"},{status:400});
if(action==="RESTRICTIONS"){const role=await database().query("SELECT role FROM km_admin_roles WHERE user_id=$1",[admin.id]).catch(()=>({rows:[]}));if(role.rows[0]?.role!=="SUPER_ADMIN")return NextResponse.json({error:"HEADQUARTERS_ONLY"},{status:403})}
try{await schema();await ensureRestrictions();const c=await database().connect();try{await c.query("BEGIN");const member=(await c.query("SELECT id,username,frozen FROM km_users WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!member){await c.query("ROLLBACK");return NextResponse.json({error:"MEMBER_NOT_FOUND"},{status:404})}
const privileged=await c.query("SELECT 1 FROM km_admin_roles WHERE user_id=$1",[id]);if(privileged.rowCount){await c.query("ROLLBACK");return NextResponse.json({error:"ADMIN_TARGET_DENIED"},{status:403})}
let detail:Record<string,unknown>={reason};
if(action==="BALANCE"){await c.query("INSERT INTO km_krw_wallets(user_id,balance) VALUES($1,0) ON CONFLICT DO NOTHING",[id]);const before=(await c.query("SELECT balance FROM km_krw_wallets WHERE user_id=$1 FOR UPDATE",[id])).rows[0];const prior=Number(before.balance),next=prior+Number(b.amount);if(!Number.isSafeInteger(next)||next<0){await c.query("ROLLBACK");return NextResponse.json({error:"INSUFFICIENT_BALANCE"},{status:409})}await c.query("UPDATE km_krw_wallets SET balance=$2,updated_at=NOW() WHERE user_id=$1",[id,next]);await c.query("INSERT INTO km_krw_ledger(id,user_id,kind,delta_krw) VALUES($1,$2,'ADMIN_ADJUSTMENT',$3)",[randomUUID(),id,b.amount]);detail={reason,amount:b.amount,before:prior,after:next}}
if(action==="FREEZE"){await c.query("UPDATE km_users SET frozen=$2 WHERE id=$1",[id,b.frozen]);detail={reason,before:member.frozen,after:b.frozen}}
if(action==="RESTRICTIONS"){
 const selected=b.restrictions;
 if(!selected||restrictionFields.some(key=>typeof selected[key]!=="boolean")||Object.keys(selected).some(key=>!restrictionFields.includes(key as typeof restrictionFields[number]))){await c.query("ROLLBACK");return NextResponse.json({error:"INVALID_RESTRICTIONS"},{status:400})}
 const before=(await c.query("SELECT stock_trading_blocked,cfd_trading_blocked,deposits_withdrawals_blocked,login_blocked FROM km_member_restrictions WHERE user_id=$1 FOR UPDATE",[id])).rows[0]||{stock_trading_blocked:false,cfd_trading_blocked:false,deposits_withdrawals_blocked:false,login_blocked:false};
 await c.query(`INSERT INTO km_member_restrictions(user_id,stock_trading_blocked,cfd_trading_blocked,deposits_withdrawals_blocked,login_blocked,updated_by) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(user_id) DO UPDATE SET stock_trading_blocked=$2,cfd_trading_blocked=$3,deposits_withdrawals_blocked=$4,login_blocked=$5,updated_by=$6,updated_at=now()`,[id,selected.stock_trading_blocked,selected.cfd_trading_blocked,selected.deposits_withdrawals_blocked,selected.login_blocked,admin.id]);
 await c.query("UPDATE km_users SET frozen=FALSE WHERE id=$1",[id]);
 detail={reason,before,after:selected};
 await c.query("INSERT INTO km_member_restriction_logs(id,user_id,admin_id,previous_state,new_state,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)",[randomUUID(),id,admin.id,JSON.stringify(before),JSON.stringify(selected),reason]);
}

if(action==="PROFILE"){const old=(await c.query("SELECT legal_name,bank,account_holder,referral FROM km_member_profiles WHERE user_id=$1 FOR UPDATE",[id])).rows[0];if(!old){await c.query("ROLLBACK");return NextResponse.json({error:"PROFILE_NOT_FOUND"},{status:404})}await c.query("UPDATE km_member_profiles SET legal_name=$2,bank=$3,account_holder=$4,referral=$5,bank_verified=FALSE WHERE user_id=$1",[id,name,bank,holder,referral||null]);detail={reason,before:old,after:{legal_name:name,bank,account_holder:holder,referral},bankVerificationReset:true}}
await c.query("INSERT INTO km_admin_member_audit(id,admin_id,member_id,action,detail) VALUES($1,$2,$3,$4,$5::jsonb)",[randomUUID(),admin.id,id,action,JSON.stringify(detail)]);await c.query("COMMIT");return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}})}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}}catch{return NextResponse.json({error:"UPDATE_FAILED"},{status:503})}}
