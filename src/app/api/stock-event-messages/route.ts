import {NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {ensureStockEventSchema} from "@/lib/stock-event";
export const dynamic="force-dynamic";
export async function GET(){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 try{await ensureStockEventSchema();const q=await database().query(`SELECT g.id,g.event_name,g.symbol,g.granted_qty,g.asset_type,g.granted_at,g.notify_member,g.notification_title,g.notification_body,
 EXISTS(SELECT 1 FROM km_stock_event_movements m WHERE m.grant_id=g.id AND m.kind='REVERSAL') AS reversed
 FROM km_stock_event_grants g WHERE g.user_id=$1 AND g.notify_member=TRUE ORDER BY g.granted_at DESC LIMIT 50`,[u.id]);
 return NextResponse.json({messages:q.rows.filter(x=>!x.reversed).map(x=>({id:x.id,title:x.notification_title||"주식 이벤트 지급 완료",body:x.notification_body||x.symbol+" · "+x.granted_qty+"주 지급",symbol:x.symbol,qty:x.granted_qty,eventName:x.event_name,createdAt:x.granted_at,assetType:"모의주식"}))},{headers:{"Cache-Control":"no-store"}})
 }catch{return NextResponse.json({error:"EVENT_MESSAGES_UNAVAILABLE"},{status:503})}
}
