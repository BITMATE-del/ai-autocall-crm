import {database,isAdmin} from "@/lib/auth";
export const PERMISSIONS=["MEMBER_LIST","MEMBER_DETAIL","TRADE_HISTORY","FUNDING_HISTORY","MEMBER_BALANCE","MEMBER_BALANCE_ADJUST","MEMBER_FREEZE","MEMBER_UNFREEZE","MEMBER_MEMO","AGENT_CREATE","AGENT_EDIT","AGENT_SUSPEND","REFERRAL_ISSUE","REFERRAL_MANAGE","PERFORMANCE_VIEW","SETTLEMENT_VIEW","PERMISSION_DELEGATE","ORG_LOG_VIEW","COMMISSION_VIEW","COMMISSION_POLICY_EDIT","WITHDRAW_HOLD_REQUEST","MEMBER_ACTIVITY_VIEW"] as const;
export type Permission=typeof PERMISSIONS[number];
export const AGENT_PERMISSIONS=new Set<Permission>(PERMISSIONS);
export type Actor={id:string;role:"ADMIN"|"SUB_HQ"|"AGENT";org:string|null;active:boolean};
export async function actorFor(userId:string):Promise<Actor|null>{
 if(await isAdmin(userId))return {id:userId,role:"ADMIN",org:null,active:true};
 const r=await database().query("SELECT m.role,m.organization_id,m.status,o.status org_status,p.status parent_status FROM km_organization_members m JOIN km_organizations o ON o.id=m.organization_id LEFT JOIN km_organizations p ON p.id=o.parent_id WHERE m.user_id=$1",[userId]);const x=r.rows[0];
 return x?{id:userId,role:x.role,org:x.organization_id,active:x.status==="ACTIVE"&&x.org_status==="ACTIVE"&&(!x.parent_status||x.parent_status==="ACTIVE")}:null;
}
export async function grantsFor(org:string){
 const r=await database().query("WITH RECURSIVE nodes AS(SELECT id,parent_id,type,status,0 depth FROM km_organizations WHERE id=$1 UNION ALL SELECT p.id,p.parent_id,p.type,p.status,n.depth+1 FROM nodes n JOIN km_organizations p ON p.id=n.parent_id WHERE n.depth<8) SELECT n.id,n.depth,n.type,n.status,g.permission_key,g.granted_status,g.can_delegate FROM nodes n LEFT JOIN km_permission_grants g ON g.subject_id=n.id ORDER BY n.depth",[org]);
 const nodes=new Map<number,{type:string;status:string;grants:Map<string,{active:boolean;delegate:boolean}>}>();
 for(const x of r.rows){let node=nodes.get(x.depth);if(!node){node={type:x.type,status:x.status,grants:new Map()};nodes.set(x.depth,node)}if(x.permission_key)node.grants.set(x.permission_key,{active:x.granted_status==="ACTIVE",delegate:x.can_delegate})}
 const subject=nodes.get(0);if(!subject)return [];
 return PERMISSIONS.map(key=>{const own=subject.grants.get(key),roleAllowed=subject.type!=="AGENT"||AGENT_PERMISSIONS.has(key);let effective=roleAllowed&&subject.status==="ACTIVE"&&!!own?.active,reason=effective?"허용":"직접 권한 없음 / 역할 제한";
 for(const [depth,node] of nodes){if(!depth)continue;if(node.status!=="ACTIVE"){effective=false;reason="상위 조직 정지"}if(node.type!=="HQ"){const inherited=node.grants.get(key);if(!inherited?.active||!inherited.delegate){effective=false;reason="상위 조직 권한 또는 재위임 회수"}}}
 return {key,direct:!!own?.active,effective,canDelegate:effective&&subject.type==="SUB_HQ"&&!!own?.delegate&&AGENT_PERMISSIONS.has(key),reason}});
}
export async function permitted(actor:Actor,key:Permission){if(actor.role==="ADMIN")return true;if(!actor.active||!actor.org)return false;return (await grantsFor(actor.org)).some(x=>x.key===key&&x.effective)}
export async function memberInScope(actor:Actor,userId:string){if(actor.role==="ADMIN")return true;if(!actor.active||!actor.org)return false;const r=await database().query("SELECT 1 FROM km_member_attributions WHERE user_id=$1 AND (organization_id=$2 OR($3='SUB_HQ' AND sub_hq_id=$2))",[userId,actor.org,actor.role]);return !!r.rowCount}
