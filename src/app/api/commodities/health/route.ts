import {NextResponse} from "next/server";
import {metalEntryQuote,metalSymbol} from "@/lib/metal-feed";
export const dynamic="force-dynamic";
export async function GET(){
 const statuses=await Promise.all(["XAUUSD"].map(async symbol=>{
  try{
   const q=await metalEntryQuote(symbol);
   return {symbol,displaySymbol:metalSymbol(symbol),quoteAvailable:true,price:q.price,asOf:q.timestamp,settlementValidated:true,tradeEnabled:process.env.KM_METALS_TRADING_ENABLED==="true"};
  }catch(e){
   const reason=e instanceof Error?e.message:"GOLD_PRICE_UNAVAILABLE";
   console.error("GOLD_HEALTH_CHECK_FAILED",{symbol,reason});
   return {symbol,displaySymbol:metalSymbol(symbol),quoteAvailable:false,settlementValidated:false,tradeEnabled:false,reason};
  }
 }));
 return NextResponse.json({statuses},{headers:{"Cache-Control":"no-store"}});
}
