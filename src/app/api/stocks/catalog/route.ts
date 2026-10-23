import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
type SymbolInfo={code:string;name:string;market:string};
let cache:{at:number;items:SymbolInfo[]}|undefined;
/** Official KRX KIND listed-corporation export. This is a reference list, NOT tradeable status/quotes. */
async function catalog(){
 if(cache&&Date.now()-cache.at<3600000)return cache.items;
 const res=await fetch("https://aikstockdata.com/data/public/quotes.json",{headers:{Accept:"application/json"},signal:AbortSignal.timeout(9500),cache:"no-store"});
 if(!res.ok)throw Error("STOCK_DIRECTORY_UNAVAILABLE");
 const payload=await res.json();
 const rows=Array.isArray(payload?.items)?payload.items:[];
 const items:SymbolInfo[]=rows.map((x:any)=>({code:String(x["종목코드"]||"").padStart(6,"0"),name:String(x["종목명"]||""),market:String(x.mrktCtg||"")})).filter((x:SymbolInfo)=>/^\\d{6}$/.test(x.code)&&x.name.length>0&&x.name.length<100&&(x.market==="KOSPI"||x.market==="KOSDAQ"));
 if(items.length<1000)throw Error("STOCK_DIRECTORY_INCOMPLETE");
 cache={at:Date.now(),items};return items;
}
export async function GET(req:Request){
 const u=new URL(req.url),query=(u.searchParams.get("q")||"").trim().toLowerCase().slice(0,60);
 const page=Math.max(1,Math.min(100,Number(u.searchParams.get("page")||"1")||1));
 try{const all=await catalog();const rows=query?all.filter(x=>(x.code+" "+x.name).toLowerCase().includes(query)):all;return NextResponse.json({source:"Public delayed market directory (aikstockdata / financial public data)",quoteAvailable:false,total:rows.length,page,items:rows.slice((page-1)*100,page*100)},{headers:{"Cache-Control":"public, max-age=60"}})}
 catch{return NextResponse.json({error:"STOCK_CATALOG_UNAVAILABLE",message:"상장 종목 명단을 불러올 수 없습니다. 기존 샘플을 전체 종목으로 표시하지 않습니다."},{status:503})}
}
