import {kisMarketRequest} from "@/lib/kis-stock-quote";
export type Candle={time:string|number;open:number;high:number;low:number;close:number;volume:number};
const numeric=(v:unknown)=>Number(String(v??"").replace(/,/g,""));
function good(c:Candle){return c.open>0&&c.close>0&&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&Number.isFinite(c.volume)&&c.volume>=0}
function currentKstDate(){return new Date(Date.now()+9*3600000).toISOString().slice(0,10).replace(/-/g,"")}
export async function getKisDailyCandles(symbol:string,period:string){
 if(!/^\d{6}$/.test(symbol))throw Error("INVALID_SYMBOL");
 const divisions:Record<string,string>={day:"D",week:"W",month:"M",year:"M"};
 const division=divisions[period]||"D";
 const end=currentKstDate(),start=new Date(Date.now()-(period==="day"?420:period==="week"?1100:3800)*86400000).toISOString().slice(0,10).replace(/-/g,"");
 const response=await kisMarketRequest("/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice","FHKST03010100",{
 FID_COND_MRKT_DIV_CODE:"J",FID_INPUT_ISCD:symbol,FID_INPUT_DATE_1:start,FID_INPUT_DATE_2:end,FID_PERIOD_DIV_CODE:division,FID_ORG_ADJ_PRC:"0"
 });
 const list=Array.isArray(response.output2)?response.output2:[];
 const candles=list.map(x=>{const d=String(x.stck_bsop_date||"");return {time:d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8),open:numeric(x.stck_oprc),high:numeric(x.stck_hgpr),low:numeric(x.stck_lwpr),close:numeric(x.stck_clpr),volume:numeric(x.acml_vol)};})
 .filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x.time))&&good(x)).sort((a,b)=>String(a.time).localeCompare(String(b.time)));
 if(!candles.length)throw Error("KIS_DAILY_EMPTY");
 // KIS may limit individual responses to 100 records; do not fabricate missing history.
 return candles;
}
export async function getKisMinuteCandles(symbol:string,size:number){
 if(!/^\d{6}$/.test(symbol)||![1,3,5,15].includes(size))throw Error("INVALID_QUERY");
 const now=new Date(Date.now()+9*3600000),hour=String(Math.min(15,Math.max(9,now.getUTCHours()))).padStart(2,"0");
 const response=await kisMarketRequest("/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice","FHKST03010200",{
 FID_COND_MRKT_DIV_CODE:"J",FID_INPUT_ISCD:symbol,FID_INPUT_HOUR_1:hour+"3000",FID_PW_DATA_INCU_YN:"Y",FID_ETC_CLS_CODE:""
 });
 const day=String(response.output1?.stck_bsop_date||currentKstDate());
 const rows=Array.isArray(response.output2)?response.output2:[];
 const parsed=rows.map(x=>{
 const clock=String(x.stck_cntg_hour||"").padStart(6,"0"),date=String(x.stck_bsop_date||day);
 const minutes=Number(clock.slice(0,2))*60+Number(clock.slice(2,4));
 const bucket=Math.floor(minutes/size)*size;
 const time=(Date.UTC(Number(date.slice(0,4)),Number(date.slice(4,6))-1,Number(date.slice(6,8)),0,bucket)-32400000)/1000;
 return {time,open:numeric(x.stck_oprc),high:numeric(x.stck_hgpr),low:numeric(x.stck_lwpr),close:numeric(x.stck_prpr),volume:numeric(x.cntg_vol||x.acml_vol)};
 }).filter(x=>Number.isFinite(x.time)&&good(x)).sort((a,b)=>a.time-b.time);
 const buckets=new Map<number,{time:number;open:number;high:number;low:number;close:number;volume:number}>();
 for(const c of parsed){const old=buckets.get(c.time);if(old){old.high=Math.max(old.high,c.high);old.low=Math.min(old.low,c.low);old.close=c.close;old.volume+=c.volume;}else buckets.set(c.time,{...c})}
 const candles=[...buckets.values()].sort((a,b)=>a.time-b.time);
 if(!candles.length)throw Error("KIS_MINUTE_EMPTY");
 return candles;
}
