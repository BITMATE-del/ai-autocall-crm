import {NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {ensureStockEventSchema} from "@/lib/stock-event";
export const dynamic="force-dynamic";
export async function GET(){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 try{await ensureStockEventSchema();await database().query("CREATE TABLE IF NOT EXISTS km_stock_event_notification_reads(user_id UUID NOT NULL REFERENCES km_users(id),grant_id UUID NOT NULL REFERENCES km_stock_event_grants(id),read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,grant_id))");const q=await database().query(`SELECT g.id,g.event_name,g.symbol,g.granted_qty,g.asset_type,g.granted_at,g.notify_member,g.notification_title,g.notification_body,EXISTS(SELECT 1 FROM km_stock_event_notification_reads rd WHERE rd.grant_id=g.id AND rd.user_id=g.user_id) AS is_read,
 EXISTS(SELECT 1 FROM km_stock_event_movements m WHERE m.grant_id=g.id AND m.kind='REVERSAL') AS reversed
 FROM km_stock_event_grants g WHERE g.user_id=$1 AND g.notify_member=TRUE ORDER BY g.granted_at DESC LIMIT 50`,[u.id]);
 return NextResponse.json({messages:q.rows.filter(x=>!x.reversed).map(x=>({id:x.id,title:x.notification_title||"주식 이벤트 지급 완료",body:x.notification_body||x.symbol+" · "+x.granted_qty+"주 지급",symbol:x.symbol,qty:x.granted_qty,eventName:x.event_name,createdAt:x.granted_at,isRead:x.is_read,assetType:"모의주식"}))},{headers:{"Cache-Control":"no-store"}})
 }catch{return NextResponse.json({error:"EVENT_MESSAGES_UNAVAILABLE"},{status:503})}
}

export async function POST(req:Request){
 const u=await currentUser();if(!u?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 if(!origin||new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 const b=await req.json().catch(()=>null),id=String(b?.id||"");
 if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({error:"INVALID_ID"},{status:400});
 try{
 await ensureStockEventSchema();
 await database().query("CREATE TABLE IF NOT EXISTS km_stock_event_notification_reads(user_id UUID NOT NULL REFERENCES km_users(id),grant_id UUID NOT NULL REFERENCES km_stock_event_grants(id),read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,grant_id))");
 const result=await database().query("INSERT INTO km_stock_event_notification_reads(user_id,grant_id) SELECT $1,id FROM km_stock_event_grants WHERE id=$2 AND user_id=$1 AND notify_member=TRUE ON CONFLICT DO NOTHING RETURNING grant_id",[u.id,id]);
 if(!result.rowCount){const known=await database().query("SELECT 1 FROM km_stock_event_grants WHERE id=$1 AND user_id=$2 AND notify_member=TRUE",[id,u.id]);if(!known.rowCount)return NextResponse.json({error:"NOT_FOUND"},{status:404})}
 return NextResponse.json({ok:true});
 }catch{return NextResponse.json({error:"NOTIFICATION_READ_FAILED"},{status:503})}
}
