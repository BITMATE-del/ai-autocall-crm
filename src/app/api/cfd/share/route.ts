import {NextRequest,NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const user=await currentUser();
 if(!user?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 const id=req.nextUrl.searchParams.get("id")||"";
 if(!/^[0-9a-f-]{36}$/i.test(id))return NextResponse.json({error:"INVALID_ID"},{status:400});
 try{
  const result=await database().query(`SELECT id,symbol,direction,amount_krw,payout_krw,result,settled_at
    FROM km_cfd_orders WHERE id=$1 AND user_id=$2 AND status='SETTLED' AND result IS NOT NULL AND settled_at IS NOT NULL`,[id,user.id]);
  const t=result.rows[0];
  if(!t)return NextResponse.json({error:"NOT_SETTLED"},{status:404});
  const amount=Number(t.amount_krw),payout=Number(t.payout_krw);
  if(!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(payout)||payout<0)return NextResponse.json({error:"INVALID_SETTLEMENT"},{status:409});
  return NextResponse.json({id:t.id,symbol:t.symbol,side:t.direction,result:t.result,profitKrw:payout-amount,roiPercent:Math.round((payout-amount)/amount*10000)/100,settledAt:t.settled_at},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"UNAVAILABLE"},{status:503})}
}
