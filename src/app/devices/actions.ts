'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function getAdminContext(){
  const supabase=await createClient()
  const {data:claims}=await supabase.auth.getClaims()
  const userId=claims?.claims?.sub as string|undefined
  if(!userId) throw new Error('로그인이 필요합니다.')
  const {data:profile,error}=await supabase.from('autocall_profiles').select('company_id,role').eq('id',userId).single()
  if(error) throw new Error(`관리자 프로필 조회 실패: ${error.message}`)
  if(!profile?.company_id||!['company_admin','team_lead'].includes(profile.role)) throw new Error('회사 관리자 권한이 없습니다.')
  return {supabase,userId,profile}
}

function pairingCode(){
  return randomBytes(4).toString('hex').toUpperCase()
}

function errorText(error:unknown){
  if(error instanceof Error) return error.message
  return '알 수 없는 서버 오류가 발생했습니다.'
}

function goError(message:string):never{
  redirect(`/devices?error=${encodeURIComponent(message)}`)
}

function goOk(message:string):never{
  redirect(`/devices?ok=${encodeURIComponent(message)}`)
}

export async function addOutboundLine(formData:FormData){
  let outcome:{ok:boolean;message:string}={ok:false,message:'회선 등록에 실패했습니다.'}
  try{
    const {supabase,profile}=await getAdminContext()
    const label=String(formData.get('label')||'').trim()
    const phone=String(formData.get('phone')||'').trim()
    const provider=String(formData.get('provider')||'').trim()
    const verified=formData.get('verified')==='on'
    if(!label||!phone) throw new Error('회선명과 발신번호를 입력하세요.')
    if(!verified) throw new Error('실제 소유/사용권한 확인에 체크해주세요.')

    const {error}=await supabase.from('outbound_lines').insert({
      company_id:profile.company_id,label,phone_e164:phone,provider:provider||'SIM',verified:true,status:'ACTIVE',
    })
    if(error) throw new Error(`회선 저장 실패: ${error.message}`)
    revalidatePath('/devices')
    outcome={ok:true,message:'발신번호가 등록되었습니다.'}
  }catch(error){
    outcome={ok:false,message:errorText(error)}
  }
  if(outcome.ok) goOk(outcome.message)
  goError(outcome.message)
}

export async function addDevice(formData:FormData){
  let outcome:{ok:boolean;message:string}={ok:false,message:'단말 등록에 실패했습니다.'}
  try{
    const {supabase,profile}=await getAdminContext()
    const name=String(formData.get('name')||'').trim()
    const lineId=String(formData.get('line_id')||'').trim()
    const deviceType=String(formData.get('device_type')||'ANDROID').trim().toUpperCase()
    if(!name) throw new Error('단말 이름을 입력하세요.')
    if(!lineId) throw new Error('먼저 발신번호를 선택하세요.')
    if(!['ANDROID','GATEWAY'].includes(deviceType)) throw new Error('현재 MVP에서는 Android/Gateway 단말만 사용합니다.')

    const {data:line,error:lineError}=await supabase.from('outbound_lines').select('id,verified,status').eq('id',lineId).eq('company_id',profile.company_id).maybeSingle()
    if(lineError) throw new Error(`발신번호 확인 실패: ${lineError.message}`)
    if(!line) throw new Error('선택한 발신번호를 찾을 수 없습니다.')
    if(!line.verified) throw new Error('사용권한 확인이 완료된 발신번호만 단말에 연결할 수 있습니다.')
    if(line.status!=='ACTIVE') throw new Error('비활성 발신번호는 사용할 수 없습니다.')

    const code=pairingCode()
    const {error}=await (supabase as any).from('call_devices').insert({
      company_id:profile.company_id,
      name,
      outbound_line_id:lineId,
      device_type:deviceType,
      status:'OFFLINE',
      pairing_code:code,
    })
    if(error) throw new Error(`단말 저장 실패: ${error.message}`)
    revalidatePath('/devices')
    outcome={ok:true,message:`단말이 등록되었습니다. 페어링 코드 ${code}`}
  }catch(error){
    outcome={ok:false,message:errorText(error)}
  }
  if(outcome.ok) goOk(outcome.message)
  goError(outcome.message)
}

export async function resetDevicePairing(formData:FormData){
  let outcome:{ok:boolean;message:string}={ok:false,message:'페어링 초기화에 실패했습니다.'}
  try{
    const {supabase,profile}=await getAdminContext()
    const deviceId=String(formData.get('device_id')||'')
    if(!deviceId) throw new Error('단말이 필요합니다.')
    const code=pairingCode()
    const {error}=await (supabase as any).from('call_devices').update({
      pairing_code:code,agent_token_hash:null,claimed_at:null,status:'OFFLINE',current_queue_id:null,updated_at:new Date().toISOString(),
    }).eq('id',deviceId).eq('company_id',profile.company_id)
    if(error) throw new Error(`페어링 초기화 실패: ${error.message}`)
    revalidatePath('/devices')
    outcome={ok:true,message:`새 페어링 코드 ${code}`}
  }catch(error){
    outcome={ok:false,message:errorText(error)}
  }
  if(outcome.ok) goOk(outcome.message)
  goError(outcome.message)
}
