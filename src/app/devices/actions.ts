'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function addOutboundLine(formData: FormData) {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub as string | undefined
  if (!userId) throw new Error('로그인이 필요합니다.')

  const { data: profile } = await supabase.from('autocall_profiles').select('company_id,role').eq('id', userId).single()
  if (!profile?.company_id || !['company_admin','team_lead'].includes(profile.role)) throw new Error('권한이 없습니다.')

  const label = String(formData.get('label') || '').trim()
  const phone = String(formData.get('phone') || '').trim()
  const provider = String(formData.get('provider') || '').trim()
  const verified = formData.get('verified') === 'on'
  if (!label || !phone) throw new Error('이름과 발신번호를 입력하세요.')

  const { error } = await supabase.from('outbound_lines').insert({
    company_id: profile.company_id,
    label,
    phone_e164: phone,
    provider: provider || null,
    verified,
    status: 'ACTIVE',
  })
  if (error) throw error
  revalidatePath('/devices')
}

export async function addDevice(formData: FormData) {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub as string | undefined
  if (!userId) throw new Error('로그인이 필요합니다.')

  const { data: profile } = await supabase.from('autocall_profiles').select('company_id,role').eq('id', userId).single()
  if (!profile?.company_id || !['company_admin','team_lead'].includes(profile.role)) throw new Error('권한이 없습니다.')

  const name = String(formData.get('name') || '').trim()
  const lineId = String(formData.get('line_id') || '').trim()
  const deviceType = String(formData.get('device_type') || 'SIP').trim()
  if (!name) throw new Error('단말 이름을 입력하세요.')

  const { error } = await supabase.from('call_devices').insert({
    company_id: profile.company_id,
    name,
    outbound_line_id: lineId || null,
    device_type: deviceType,
    status: 'OFFLINE',
  })
  if (error) throw error
  revalidatePath('/devices')
}
