'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function getAdminContext(){
  const supabase=await createClient()
  const {data:claims}=await supabase.auth.getClaims()
  const userId=claims?.claims?.sub as string|undefined
  if(!userId) throw new Error('로그인이 필요합니다.')
  const {data:profile}=await supabase.from('autocall_profiles').select('company_id,role').eq('id',userId).single()
  if(!profile?.company_id||!['company_admin','team_lead'].includes(profile.role)) throw new Error('권한이 없습니다.')
  return {supabase,userId,profile}
}

function pairingCode(){
  return randomBytes(4).toString('hex').toUpperCase()
}

export async function addOutboundLine(formData:FormData){
  const {supabase,profile}=await getAdminContext()
  const label=String(formData.get('label')||'').trim()
  const phone=String(formData.get('phone')||'').trim()
  const provider=String(formData.get('provider')||'').trim()
  const verified=formData.get('verified')==='on'
  if(!label||!phone) throw new Error('이름과 발신번호를 입력하세요.')

  const {error}=await supabase.from('outbound_lines').insert({
    company_id:profile.company_id,label,phone_e164:phone,provider:provider||'SIM',verified,status:'ACTIVE',
  })
  if(error) throw error
  revalidatePath('/devices')
}

export async function addDevice(formData:FormData){
  const {supabase,profile}=await getAdminContext()
  const name=String(formData.get('name')||'').trim()
  const lineId=String(formData.get('line_id')||'').trim()
  const deviceType=String(formData.get('device_type')||'ANDROID').trim().toUpperCase()
  if(!name) throw new Error('단말 이름을 입력하세요.')
  if(!['ANDROID','GATEWAY'].includes(deviceType)) throw new Error('현재 MVP에서는 Android/Gateway 단말만 사용합니다.')

  const {error}=await (supabase as any).from('call_devices').insert({
    company_id:profile.company_id,
    name,
    outbound_line_id:lineId||null,
    device_type:deviceType,
    status:'OFFLINE',
    pairing_code:pairingCode(),
  })
  if(error) throw error
  revalidatePath('/devices')
}

export async function resetDevicePairing(formData:FormData){
  const {supabase,profile}=await getAdminContext()
  const deviceId=String(formData.get('device_id')||'')
  if(!deviceId) throw new Error('단말이 필요합니다.')
  const {error}=await (supabase as any).from('call_devices').update({
    pairing_code:pairingCode(),agent_token_hash:null,claimed_at:null,status:'OFFLINE',current_queue_id:null,updated_at:new Date().toISOString(),
  }).eq('id',deviceId).eq('company_id',profile.company_id)
  if(error) throw error
  revalidatePath('/devices')
}
