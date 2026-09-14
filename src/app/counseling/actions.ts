'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function saveCounselingResult(formData: FormData) {
  const supabase = await createClient()
  const leadId = String(formData.get('lead_id') || '')
  const status = String(formData.get('status') || 'IN_COUNSELING')
  const memo = String(formData.get('memo') || '').trim()
  const callbackAtRaw = String(formData.get('callback_at') || '').trim()
  const callbackAt = callbackAtRaw ? new Date(callbackAtRaw).toISOString() : null
  if (!leadId) return

  const { error } = await supabase.rpc('save_counseling_result', {
    p_lead_id: leadId,
    p_status: status,
    p_memo: memo || null,
    p_callback_at: callbackAt,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/counseling')
}
