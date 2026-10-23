import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
export async function GET(){
 try{
  const res=await fetch("https://polling.finance.naver.com/api/realtime?query=SERVICE_INDEX:KOSPI,KOSDAQ",{cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(7000)});
  if(!res.ok)throw Error("INDEX_HTTP");
  const json=await res.json();
  const rows=json?.result?.areas?.find((x:{name?:string})=>x.name==="SERVICE_INDEX")?.datas;
  if(!Array.isArray(rows))throw Error("INDEX_EMPTY");
  const indices=rows.filter((x:{cd?:string})=>x.cd==="KOSPI"||x.cd==="KOSDAQ").map((x:{cd:string;nv:number;cv:number;cr:number;ov:number;hv:number;lv:number;ms?:string})=>({code:x.cd,value:Number(x.nv)/100,change:Number(x.cv)/100,rate:Number(x.cr),open:Number(x.ov)/100,high:Number(x.hv)/100,low:Number(x.lv)/100,status:x.ms||"UNKNOWN"}));
  if(indices.length!==2||indices.some((x:{value:number})=>!Number.isFinite(x.value)||x.value<=0))throw Error("INDEX_INVALID");
  return NextResponse.json({indices,asOf:json?.result?.time||null,source:"NAVER_PUBLIC_REFERENCE"},{headers:{"Cache-Control":"public, s-maxage=15, stale-while-revalidate=20"}});
 }catch{return NextResponse.json({error:"INDEX_UNAVAILABLE"},{status:503})}
}
