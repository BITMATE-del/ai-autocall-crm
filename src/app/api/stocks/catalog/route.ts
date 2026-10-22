import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
type SymbolInfo={code:string;name:string;market:string};
let cache:{at:number;items:SymbolInfo[]}|undefined;
/** Official KRX KIND listed-corporation export. This is a reference list, NOT tradeable status/quotes. */
async function catalog(){
 if(cache&&Date.now()-cache.at<3600000)return cache.items;
 const res=await fetch("https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13",{headers:{"User-Agent":"Mozilla/5.0 (compatible; KMarketsReference/1.0)","Accept":"text/html"},signal:AbortSignal.timeout(9500),cache:"no-store"});
 if(!res.ok)throw Error("KRX_LIST_UNAVAILABLE");
 const html=await res.text();
 const decode=(v:string)=>v.replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
 const rows=[...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
 let header:string[]=[];const items:SymbolInfo[]=[];
 for(const row of rows){const cells=[...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(v=>decode(v[1]));if(!cells.length)continue;
  if(cells.some(x=>x.includes("종목코드"))){header=cells;continue}
  const codeIndex=header.findIndex(x=>x.includes("종목코드"));const nameIndex=header.findIndex(x=>x.includes("회사명"));const marketIndex=header.findIndex(x=>x.includes("시장구분"));
  if(codeIndex<0||nameIndex<0)continue;
  const code=cells[codeIndex]?.replace(/\D/g,"").padStart(6,"0");
  const name=cells[nameIndex]?.trim();const market=marketIndex>=0?(cells[marketIndex]||""):"";
  if(/^\d{6}$/.test(code)&&name&&name.length<100)items.push({code,name,market});
 }
 if(items.length<1000)throw Error("KRX_CATALOG_PARSE_FAILED");
 cache={at:Date.now(),items};return items;
}
export async function GET(req:Request){
 const u=new URL(req.url),query=(u.searchParams.get("q")||"").trim().toLowerCase().slice(0,60);
 const page=Math.max(1,Math.min(100,Number(u.searchParams.get("page")||"1")||1));
 try{const all=await catalog();const rows=query?all.filter(x=>(x.code+" "+x.name).toLowerCase().includes(query)):all;return NextResponse.json({source:"KRX KIND listed corporation directory",quoteAvailable:false,total:rows.length,page,items:rows.slice((page-1)*100,page*100)},{headers:{"Cache-Control":"public, max-age=60"}})}
 catch{return NextResponse.json({error:"KRX_CATALOG_UNAVAILABLE",message:"상장 종목 명단을 불러올 수 없습니다. 기존 샘플을 전체 종목으로 표시하지 않습니다."},{status:503})}
}
