import {inflateRawSync} from "node:zlib";
export type KisSymbol={code:string;name:string;market:"KOSPI"|"KOSDAQ"};
let saved:{at:number;items:KisSymbol[]}|undefined;
let pending:Promise<KisSymbol[]>|undefined;
/** KIS official .mst ZIP: parse its central directory, not mutable local header sizes. */
function unzipFirst(zip:Buffer){
 let end=-1;
 for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--){if(zip.readUInt32LE(i)===0x06054b50){end=i;break}}
 if(end<0)throw Error("KIS_MASTER_ZIP_INVALID");
 let position=zip.readUInt32LE(end+16);
 if(zip.readUInt32LE(position)!==0x02014b50)throw Error("KIS_MASTER_CENTRAL_INVALID");
 const method=zip.readUInt16LE(position+10),size=zip.readUInt32LE(position+20),local=zip.readUInt32LE(position+42);
 if(size>12_000_000||local<0||local+30>zip.length)throw Error("KIS_MASTER_SIZE");
 if(zip.readUInt32LE(local)!==0x04034b50)throw Error("KIS_MASTER_LOCAL_INVALID");
 const begin=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28);
 const payload=zip.subarray(begin,begin+size);
 if(method===0)return payload;
 if(method===8)return inflateRawSync(payload);
 throw Error("KIS_MASTER_COMPRESSION_UNSUPPORTED");
}
async function loadOne(market:"KOSPI"|"KOSDAQ"){
 const name=market==="KOSPI"?"kospi":"kosdaq";
 const url="https://new.real.download.dws.co.kr/common/master/"+name+"_code.mst.zip";
 const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error("KIS_MASTER_HTTP_"+r.status);
 const zip=Buffer.from(await r.arrayBuffer());
 if(zip.length>12_000_000)throw Error("KIS_MASTER_ZIP_OVERSIZE");
 const body=unzipFirst(zip),decoder=new TextDecoder("euc-kr");
 const suffix=market==="KOSPI"?228:222;
 const rows=decoder.decode(body).split(/\r?\n/);
 return rows.map(row=>{
 const front=row.slice(0,Math.max(0,row.length-suffix));
 const code=front.slice(0,9).trim(),name=front.slice(21).trim();
 return {code,name,market};
 }).filter(x=>/^\d{6}$/.test(x.code)&&x.name.length>0&&x.name.length<110);
}
export async function getKisStockDirectory(){
 if(saved&&Date.now()-saved.at<6*3600000)return saved.items;
 if(!pending)pending=(async()=>{
 const groups=await Promise.all([loadOne("KOSPI"),loadOne("KOSDAQ")]);
 const items=groups.flat();
 if(items.length<1500)throw Error("KIS_MASTER_INCOMPLETE");
 saved={at:Date.now(),items};return items;
 })().finally(()=>{pending=undefined});
 try{return await pending}catch(e){if(saved)return saved.items;throw e}
}
