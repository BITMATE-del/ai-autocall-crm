import { createGatewayRpcClient, jsonError } from '@/lib/gateway/rpc'

export async function POST(request:Request){
  try{
    const body=await request.json()
    const pairingCode=String(body?.pairingCode||'').trim().toUpperCase()
    if(!pairingCode) return jsonError('pairingCode is required')
    const supabase=createGatewayRpcClient() as any
    const {data,error}=await supabase.rpc('claim_gateway_device',{
      p_pairing_code:pairingCode,
      p_meta:{
        agent_version:body?.agentVersion||null,
        model:body?.model||null,
        android_version:body?.androidVersion||null,
      },
    })
    if(error) return jsonError(error.message,401)
    return Response.json({ok:true,...data})
  }catch(e:any){
    return jsonError(e?.message||'PAIRING_FAILED',500)
  }
}
