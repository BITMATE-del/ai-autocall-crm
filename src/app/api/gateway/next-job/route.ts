import { createGatewayRpcClient, jsonError } from '@/lib/gateway/rpc'

export async function POST(request:Request){
  try{
    const body=await request.json()
    const deviceId=String(body?.deviceId||'')
    const token=String(body?.token||'')
    if(!deviceId||!token) return jsonError('deviceId and token are required')
    const supabase=createGatewayRpcClient() as any
    const {data,error}=await supabase.rpc('gateway_claim_next_job',{p_device_id:deviceId,p_token:token})
    if(error) return jsonError(error.message,401)
    return Response.json(data)
  }catch(e:any){ return jsonError(e?.message||'CLAIM_FAILED',500) }
}
