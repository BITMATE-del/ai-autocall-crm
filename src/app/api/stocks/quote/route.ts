import {NextResponse} from "next/server";
import {getKrStockQuote} from "@/lib/kr-stock-quote";
export const dynamic="force-dynamic";
export async function GET(req:Request){const symbol=new URL(req.url).searchParams.get("symbol")||"";try{const quote=await getKrStockQuote(symbol);return NextResponse.json({quote,feedStatus:process.env.KM_STOCK_QUOTE_PROVIDER==="KIS"&&quote.provider!=="KIS_REST"?"KIS_FALLBACK":"PRIMARY",tradable:quote.marketStatus==="REGULAR_SESSION"&&Date.now()-Date.parse(quote.asOf)<=60000&&(process.env.KM_STOCK_QUOTE_PROVIDER!=="KIS"||quote.provider==="KIS_REST")},{headers:{"Cache-Control":"no-store"}})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"QUOTE_UNAVAILABLE",tradable:false},{status:503})}}
