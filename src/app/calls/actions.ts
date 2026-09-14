'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function createCampaign(formData: FormData){
  const supabase=await createClient()
  const name=String(formData.get('name')||'').trim()
  const product=String(formData.get('product')||'').trim()
  const lineId=String(formData.get('line_id')||'').trim()
  const dailyLimit=Number(formData.get('daily_limit')||0)
  const {error}=await supabase.rpc('create_call_campaign',{p_name:name,p_product:product||null,p_outbound_line_id:lineId||null,p_daily_limit:Number.isFinite(dailyLimit)?dailyLimit:0})
  if(error) throw error
  revalidatePath('/calls')
}

export async function enqueueCampaign(formData: FormData){
  const supabase=await createClient()
  const campaignId=String(formData.get('campaign_id')||'')
  const limit=Number(formData.get('limit')||100)
  const {error}=await supabase.rpc('enqueue_campaign_leads',{p_campaign_id:campaignId,p_limit:Number.isFinite(limit)?limit:100})
  if(error) throw error
  revalidatePath('/calls')
}

export async function recordResult(formData: FormData){
  const supabase=await createClient()
  const queueId=String(formData.get('queue_id')||'')
  const result=String(formData.get('result')||'')
  const {error}=await supabase.rpc('record_call_result',{p_queue_id:queueId,p_result:result,p_provider_call_id:null,p_payload:{source:'crm_manual'}})
  if(error) throw error
  revalidatePath('/calls')
  revalidatePath('/pool')
  revalidatePath('/leads')
}
