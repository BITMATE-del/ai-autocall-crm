import { createGatewayRpcClient, jsonError } from '@/lib/gateway/rpc'

export async function POST(request:Request){
  try{
    const body=await request.json()
    const deviceId=String(body?.deviceId||'')
    const token=String(body?.token||'')
    if(!deviceId||!token) return jsonError('deviceId and token are required')
    const supabase=createGatewayRpcClient() as any
    const {data,error}=await supabase.rpc('gateway_heartbeat',{
      p_device_id:deviceId,
      p_token:token,
      p_status:String(body?.status||'ONLINE'),
      p_battery_pct:Number.isFinite(body?.batteryPct)?body.batteryPct:null,
      p_charging:typeof body?.charging==='boolean'?body.charging:null,
      p_meta:body?.meta||{},
    })
    if(error) return jsonError(error.message,401)
    return Response.json(data)
  }catch(e:any){ return jsonError(e?.message||'HEARTBEAT_FAILED',500) }
}
