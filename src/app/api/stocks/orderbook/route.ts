import {NextRequest,NextResponse} from "next/server";
import {database} from "@/lib/auth";
import {kisMarketRequest} from "@/lib/kis-stock-quote";
export const dynamic="force-dynamic";
const number=(v:unknown)=>{const n=Number(String(v??"").replace(/,/g,""));return Number.isSafeInteger(n)&&n>=0?n:null};
type Level={price:number;qty:number};
type Book={symbol:string;market:string;asks:Level[];bids:Level[];totalAsk:number|null;totalBid:number|null;asOf:string;source:string};
const memory=new Map<string,{book:Book;time:number}>();
const pending=new Map<string,Promise<Book>>();
const maxAge=15000;
function parse(symbol:string,d:Record<string,string>):Book{
 const asks:Level[]=[],bids:Level[]=[];
 for(let i=1;i<=10;i++){
  const ap=number(d["askp"+i]),av=number(d["askp_rsqn"+i]),bp=number(d["bidp"+i]),bv=number(d["bidp_rsqn"+i]);
  if(ap!==null&&ap>0&&av!==null)asks.push({price:ap,qty:av});
  if(bp!==null&&bp>0&&bv!==null)bids.push({price:bp,qty:bv});
 }
 if(!asks.length&&!bids.length)throw Error("EMPTY_LEVELS");
 return {symbol,market:"KRX",asks,bids,totalAsk:number(d.total_askp_rsqn),totalBid:number(d.total_bidp_rsqn),asOf:new Date().toISOString(),source:"KIS_REST"};
}
async function readKis(symbol:string){
 const data=await kisMarketRequest("/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn","FHKST01010200",{FID_COND_MRKT_DIV_CODE:"J",FID_INPUT_ISCD:symbol}) as {output1?:Record<string,string>};
 if(!data.output1)throw Error("EMPTY_ORDERBOOK");
 return parse(symbol,data.output1);
}
async function readShared(symbol:string):Promise<Book|null>{
 try{
  const r=await database().query("SELECT payload,received_at FROM km_kis_live_books WHERE symbol=$1 AND received_at>NOW()-INTERVAL '15 seconds' LIMIT 1",[symbol]);
  if(r.rowCount&&r.rows[0]?.payload?.asks?.length)return r.rows[0].payload as Book;
 }catch{}
 return null;
}
async function saveShared(symbol:string,book:Book){
 try{await database().query("INSERT INTO km_kis_live_books(symbol,payload,received_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(symbol) DO UPDATE SET payload=$2::jsonb,received_at=NOW()",[symbol,JSON.stringify(book)])}catch{}
}
export async function GET(req:NextRequest){
 const symbol=req.nextUrl.searchParams.get("symbol")||"";
 if(!/^\d{6}$/.test(symbol))return NextResponse.json({error:"INVALID_SYMBOL"},{status:400});
 const now=Date.now(),local=memory.get(symbol);
 if(local&&now-local.time<4000)return NextResponse.json(local.book,{headers:{"Cache-Control":"private, no-store"}});
 const shared=await readShared(symbol);
 if(shared){memory.set(symbol,{book:shared,time:Date.now()});return NextResponse.json(shared,{headers:{"Cache-Control":"private, no-store"}})}
 let work=pending.get(symbol);
 if(!work){work=readKis(symbol);pending.set(symbol,work);void work.finally(()=>pending.delete(symbol)).catch(()=>{})}
 try{
  const book=await work;memory.set(symbol,{book,time:Date.now()});void saveShared(symbol,book);
  return NextResponse.json(book,{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){
  const reason=e instanceof Error?e.message:"UNKNOWN";
  const code=/^(KIS_[A-Z0-9_]+|EMPTY_ORDERBOOK|EMPTY_LEVELS)$/.test(reason)?reason:"ORDERBOOK_UPSTREAM_ERROR";
  console.error("KIS_ORDERBOOK_FETCH_FAILED",code,{symbol});
  return NextResponse.json({error:"ORDERBOOK_UNAVAILABLE",reason:code},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
