import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {currentUser,database,init} from "@/lib/auth";
export const dynamic="force-dynamic";
const DEMO_PRICES:Record<string,{name:string,price:number}>={
 "005930":{name:"삼성전자",price:64200},
 "000660":{name:"SK하이닉스",price:193800},
 "035420":{name:"NAVER",price:214500},
 "035720":{name:"카카오",price:42350},
 "005380":{name:"현대차",price:239500},
 "068270":{name:"셀트리온",price:184900}
};
let schema:Promise<void>|undefined;
async function ensureSchema(){
 if(!schema)schema=(async()=>{
  await init();
  await database().query(`CREATE TABLE IF NOT EXISTS km_stock_demo_wallets(
    user_id UUID PRIMARY KEY REFERENCES km_users(id),
    cash_krw BIGINT NOT NULL DEFAULT 10000000 CHECK(cash_krw>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await database().query(`CREATE TABLE IF NOT EXISTS km_stock_demo_holdings(
    user_id UUID NOT NULL REFERENCES km_users(id),
    symbol TEXT NOT NULL,qty BIGINT NOT NULL CHECK(qty>=0),
    PRIMARY KEY(user_id,symbol)
  )`);
  await database().query(`CREATE TABLE IF NOT EXISTS km_stock_demo_orders(
    id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES km_users(id),
    symbol TEXT NOT NULL,side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
    qty BIGINT NOT NULL CHECK(qty>0),execution_price_krw BIGINT NOT NULL CHECK(execution_price_krw>0),
    amount_krw BIGINT NOT NULL CHECK(amount_krw>0),status TEXT NOT NULL DEFAULT 'DEMO_FILLED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await database().query("CREATE INDEX IF NOT EXISTS km_stock_demo_orders_member ON km_stock_demo_orders(user_id,created_at DESC)");
 })().catch(e=>{schema=undefined;throw e});
 return schema;
}
export async function GET(){
 const user=await currentUser();
 if(!user?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 try{
  await ensureSchema();
  await database().query("INSERT INTO km_stock_demo_wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",[user.id]);
  const [w,h,o]=await Promise.all([
   database().query("SELECT cash_krw FROM km_stock_demo_wallets WHERE user_id=$1",[user.id]),
   database().query("SELECT symbol,qty FROM km_stock_demo_holdings WHERE user_id=$1 AND qty>0 ORDER BY symbol",[user.id]),
   database().query("SELECT id,symbol,side,qty,execution_price_krw,amount_krw,status,created_at FROM km_stock_demo_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",[user.id])
  ]);
  return NextResponse.json({mode:"PAPER_DEMO_ONLY",cashKrw:Number(w.rows[0]?.cash_krw||0),holdings:h.rows.map(x=>({symbol:x.symbol,qty:Number(x.qty),name:DEMO_PRICES[x.symbol]?.name||x.symbol,referencePriceKrw:DEMO_PRICES[x.symbol]?.price||null})),orders:o.rows.map(x=>({id:x.id,symbol:x.symbol,side:x.side,qty:Number(x.qty),executionPriceKrw:Number(x.execution_price_krw),amountKrw:Number(x.amount_krw),status:x.status,createdAt:x.created_at})),quotes:DEMO_PRICES},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"STOCK_DEMO_UNAVAILABLE"},{status:503})}
}
export async function POST(req:Request){
 const user=await currentUser();if(!user?.id)return NextResponse.json({error:"LOGIN_REQUIRED"},{status:401});
 const origin=req.headers.get("origin"),host=(req.headers.get("x-forwarded-host")||req.headers.get("host")||new URL(req.url).host).split(",")[0].trim();
 if(origin&&new URL(origin).host!==host)return NextResponse.json({error:"INVALID_ORIGIN"},{status:403});
 let body:any;try{body=await req.json()}catch{return NextResponse.json({error:"INVALID_BODY"},{status:400})}
 const symbol=String(body.symbol||""),side=String(body.side||""),q=String(body.qty||""),clientId=String(body.clientOrderId||"");
 if(!DEMO_PRICES[symbol]||!["BUY","SELL"].includes(side)||!/^[1-9]\d{0,5}$/.test(q)||!/^[0-9a-f-]{36}$/i.test(clientId))return NextResponse.json({error:"INVALID_DEMO_ORDER"},{status:400});
 const qty=Number(q),price=DEMO_PRICES[symbol].price,amount=qty*price;
 if(!Number.isSafeInteger(amount)||amount>10000000000)return NextResponse.json({error:"AMOUNT_TOO_LARGE"},{status:400});
 try{
  await ensureSchema();const c=await database().connect();
  try{
   await c.query("BEGIN");
   await c.query("INSERT INTO km_stock_demo_wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",[user.id]);
   await c.query("SELECT cash_krw FROM km_stock_demo_wallets WHERE user_id=$1 FOR UPDATE",[user.id]);
   const found=await c.query("SELECT id FROM km_stock_demo_orders WHERE id=$1 AND user_id=$2",[clientId,user.id]);
   if(found.rowCount){await c.query("COMMIT");return NextResponse.json({ok:true,id:clientId,alreadyProcessed:true,mode:"PAPER_DEMO_ONLY"})}
   if(side==="BUY"){
    const d=await c.query("UPDATE km_stock_demo_wallets SET cash_krw=cash_krw-$2,updated_at=now() WHERE user_id=$1 AND cash_krw>=$2 RETURNING cash_krw",[user.id,amount]);
    if(!d.rowCount){await c.query("ROLLBACK");return NextResponse.json({error:"DEMO_CASH_INSUFFICIENT"},{status:409})}
    await c.query("INSERT INTO km_stock_demo_holdings(user_id,symbol,qty) VALUES($1,$2,$3) ON CONFLICT(user_id,symbol) DO UPDATE SET qty=km_stock_demo_holdings.qty+EXCLUDED.qty",[user.id,symbol,qty]);
   }else{
    const d=await c.query("UPDATE km_stock_demo_holdings SET qty=qty-$3 WHERE user_id=$1 AND symbol=$2 AND qty>=$3 RETURNING qty",[user.id,symbol,qty]);
    if(!d.rowCount){await c.query("ROLLBACK");return NextResponse.json({error:"DEMO_SHARES_INSUFFICIENT"},{status:409})}
    await c.query("UPDATE km_stock_demo_wallets SET cash_krw=cash_krw+$2,updated_at=now() WHERE user_id=$1",[user.id,amount]);
   }
   await c.query("INSERT INTO km_stock_demo_orders(id,user_id,symbol,side,qty,execution_price_krw,amount_krw) VALUES($1,$2,$3,$4,$5,$6,$7)",[clientId,user.id,symbol,side,qty,price,amount]);
   await c.query("COMMIT");return NextResponse.json({ok:true,id:clientId,mode:"PAPER_DEMO_ONLY",executionPriceKrw:price,amountKrw:amount});
  }catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}
 }catch{return NextResponse.json({error:"DEMO_ORDER_FAILED"},{status:503})}
}
