import {NextResponse} from "next/server";
export const dynamic="force-dynamic";
const assets=[{id:"XAUUSD",ticker:"GC=F"}];
async function change(ticker:string):Promise<number|null>{
 try{
 const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(ticker)+"?interval=1d&range=5d";
 const response=await fetch(url,{next:{revalidate:60},headers:{"User-Agent":"Mozilla/5.0 (compatible; MarketPreview/1.0)","Accept":"application/json"},signal:AbortSignal.timeout(5500)});
 if(!response.ok)return null;
 const json=await response.json();
 const result=json?.chart?.result?.[0];
 const meta=result?.meta;
 const current=Number(meta?.regularMarketPrice);
 const previous=Number(meta?.chartPreviousClose??meta?.previousClose);
 if(!Number.isFinite(current)||!Number.isFinite(previous)||previous<=0)return null;
 return Math.round((current-previous)/previous*10000)/100;
 }catch{return null}
}
export async function GET(){
 const values=await Promise.all(assets.map(a=>change(a.ticker)));
 const rates:Object=Object.fromEntries(assets.map((a,i)=>[a.id,values[i]]));
 return NextResponse.json({rates,source:"Yahoo Finance commodity futures quotes (indicative, not trading prices)"},{headers:{"Cache-Control":"public, max-age=60"}});
}