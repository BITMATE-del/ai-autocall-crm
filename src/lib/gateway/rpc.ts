import { createClient } from '@supabase/supabase-js'

export function createGatewayRpcClient(){
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession:false, autoRefreshToken:false } }
  )
}

export function jsonError(message:string,status=400){
  return Response.json({ok:false,error:message},{status})
}
