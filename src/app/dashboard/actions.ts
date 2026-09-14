'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function pauseAllCampaigns(){
  const supabase=(await createClient()) as any
  const {data:claims}=await supabase.auth.getClaims()
  const userId=claims?.claims?.sub as string|undefined
  if(!userId) throw new Error('로그인이 필요합니다.')
  const {data:profile}=await supabase.from('autocall_profiles').select('company_id,role').eq('id',userId).single()
  if(!profile?.company_id||!['company_admin','team_lead'].includes(profile.role)) throw new Error('권한이 없습니다.')

  const {error}=await supabase.from('call_campaigns')
    .update({status:'PAUSED',updated_at:new Date().toISOString()})
    .eq('company_id',profile.company_id)
    .in('status',['RUNNING','ACTIVE'])
  if(error) throw error

  await supabase.from('audit_logs').insert({company_id:profile.company_id,user_id:userId,action:'CAMPAIGNS_PAUSE_ALL',target_type:'call_campaigns',after:{status:'PAUSED'}})
  revalidatePath('/dashboard')
  revalidatePath('/calls')
}
