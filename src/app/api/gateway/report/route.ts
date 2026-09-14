import { createGatewayRpcClient, jsonError } from '@/lib/gateway/rpc'

export async function POST(request:Request){
  try{
    const body=await request.json()
    const deviceId=String(body?.deviceId||'')
    const token=String(body?.token||'')
    const queueId=String(body?.queueId||'')
    const event=String(body?.event||'').trim().toUpperCase()
    if(!deviceId||!token||!queueId||!event) return jsonError('deviceId, token, queueId and event are required')
    const supabase=createGatewayRpcClient() as any
    const {data,error}=await supabase.rpc('gateway_report_event',{
      p_device_id:deviceId,
      p_token:token,
      p_queue_id:queueId,
      p_event:event,
      p_payload:body?.payload||{},
    })
    if(error) return jsonError(error.message,400)
    return Response.json(data)
  }catch(e:any){ return jsonError(e?.message||'REPORT_FAILED',500) }
}
