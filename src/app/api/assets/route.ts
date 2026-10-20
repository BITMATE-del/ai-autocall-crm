import {NextResponse} from "next/server";
import {currentUser,database,init} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(){
 const user=await currentUser();
 if(!user?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 try{
 await init();
 const [member,wallet,trades,ledger]=await Promise.all([
 database().query("SELECT legal_name,bank,account_holder,bank_verified,created_at,referral FROM km_member_profiles WHERE user_id=$1",[user.id]),
 database().query("SELECT balance,updated_at FROM km_krw_wallets WHERE user_id=$1",[user.id]).catch(()=>({rows:[]})),
 database().query("SELECT id,symbol,direction,duration_minutes,amount_krw,entry_price,exit_price,result,payout_krw,status,created_at,expires_at FROM km_cfd_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[user.id]).catch(()=>({rows:[]})),
 database().query("SELECT id,kind,delta_krw,created_at FROM km_krw_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[user.id]).catch(()=>({rows:[]}))
 ]);
 const profile=member.rows[0];const rows=trades.rows;
 return NextResponse.json({
 account:{username:user.username,name:profile?.legal_name||"",bank:profile?.bank||"",accountHolder:profile?.account_holder||"",bankVerified:profile?.bank_verified===true,joinedAt:profile?.created_at||null,referral:profile?.referral||null},
 wallet:{currency:"KRW",balance:Number(wallet.rows[0]?.balance||0)},
 summary:{active:rows.filter(x=>x.status==="ACTIVE").length,completed:rows.filter(x=>x.status==="SETTLED").length,profit:rows.filter(x=>x.status==="SETTLED").reduce((n,x)=>n+Number(x.payout_krw||0)-Number(x.amount_krw||0),0)},
 trades:rows.map(x=>({...x,amount_krw:Number(x.amount_krw),entry_price:Number(x.entry_price),exit_price:x.exit_price==null?null:Number(x.exit_price),payout_krw:x.payout_krw==null?null:Number(x.payout_krw)})),
 ledger:ledger.rows.map(x=>({...x,delta_krw:Number(x.delta_krw)}))
 },{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"DATA_UNAVAILABLE"},{status:503})}
}