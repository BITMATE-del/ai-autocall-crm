import {NextRequest,NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 const id=req.nextUrl.searchParams.get("id");
 try{
  if(id&&!/^[a-f\d-]{36}$/i.test(id))return NextResponse.json({error:"INVALID_ID"},{status:400});
  const result=await database().query(`SELECT id,symbol,side,qty,realized_cost_krw,realized_pnl_krw,created_at
   FROM km_stock_internal_orders WHERE user_id=$1 AND side='SELL' AND status='INTERNAL_FILLED'
   AND realized_cost_krw IS NOT NULL AND realized_pnl_krw IS NOT NULL
   AND ($2::uuid IS NULL OR id=$2::uuid) ORDER BY created_at DESC LIMIT 100`,[u.id,id||null]);
  const names:Record<string,string>={"005930":"삼성전자","000660":"SK하이닉스","035420":"NAVER","035720":"카카오","005380":"현대차","068270":"셀트리온"};
  const rows=result.rows.map(t=>{const profit=Number(t.realized_pnl_krw),cost=Number(t.realized_cost_krw);
   return {id:t.id,symbol:t.symbol,stockName:names[t.symbol]||null,side:"SELL",result:profit>0?"WIN":profit<0?"LOSS":"DRAW",profitKrw:profit,roiPercent:cost>0?Math.round(profit/cost*10000)/100:null,settledAt:t.created_at,qty:Number(t.qty)};});
  if(id&&!rows.length)return NextResponse.json({error:"NO_VERIFIED_RESULT"},{status:404});
  return NextResponse.json(id?rows[0]:{results:rows},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"STOCK_RESULT_UNAVAILABLE"},{status:503})}
}
