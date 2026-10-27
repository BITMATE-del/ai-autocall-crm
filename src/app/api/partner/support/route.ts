import {NextResponse} from "next/server";
import {currentUser,database} from "@/lib/auth";
import {actorFor,permitted} from "@/lib/org-access";
export const dynamic="force-dynamic";
const err=(error:string,status=400)=>NextResponse.json({error},{status});
async function access(){const u=await currentUser();if(!u?.id)return null;const a=await actorFor(u.id);if(!a?.active||a.role==="ADMIN"||!a.org||!(await permitted(a,"MEMBER_LIST")))return null;return a}
const scope="JOIN km_member_attributions ma ON ma.user_id=t.user_id AND (ma.organization_id=$1 OR ($2='SUB_HQ' AND ma.sub_hq_id=$1))";
export async function GET(){const a=await access();if(!a)return err("FORBIDDEN",403);try{const r=await database().query(`SELECT t.id,t.category,t.message,t.reply,t.created_at,t.replied_at,u.username FROM km_support_tickets t ${scope} JOIN km_users u ON u.id=t.user_id ORDER BY (t.reply IS NOT NULL),t.created_at DESC LIMIT 200`,[a.org,a.role]);return NextResponse.json({tickets:r.rows},{headers:{"Cache-Control":"no-store"}})}catch{return err("UNAVAILABLE",503)}}
export async function POST(req:Request){const a=await access();if(!a)return err("FORBIDDEN",403);
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();if(!origin||new URL(origin).host!==host)return err("INVALID_ORIGIN",403);
 const b=await req.json().catch(()=>null),id=String(b?.id||""),reply=String(b?.reply||"").trim();
 if(!/^[0-9a-f-]{36}$/i.test(id)||reply.length<2||reply.length>2000)return err("INVALID_INPUT");
 const client=await database().connect();try{await client.query("BEGIN");
 const r=await client.query(`SELECT t.id,t.user_id,t.reply FROM km_support_tickets t ${scope} WHERE t.id=$3 FOR UPDATE OF t`,[a.org,a.role,id]);
 if(!r.rowCount){await client.query("ROLLBACK");return err("OUT_OF_SCOPE",403)}
 if(r.rows[0].reply!==null){await client.query("ROLLBACK");return err("ALREADY_ANSWERED",409)}
 await client.query("UPDATE km_support_tickets SET reply=$2,replied_at=NOW(),read_at=NULL,answered_by=$3 WHERE id=$1",[id,reply,a.id]);
 await client.query("INSERT INTO km_management_audit_logs(actor_id,target_id,action,after_data) VALUES($1,$2,'SUPPORT_REPLIED',$3::jsonb)",[a.id,r.rows[0].user_id,JSON.stringify({ticketId:id})]);
 await client.query("COMMIT");return NextResponse.json({ok:true});
 }catch{await client.query("ROLLBACK");return err("REPLY_FAILED",503)}finally{client.release()}
}
