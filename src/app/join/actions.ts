'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function claimInvite(formData: FormData) {
  const supabase = await createClient()
  const code = String(formData.get('code') || '').trim().toUpperCase()
  if (!code) return
  const { error } = await supabase.rpc('claim_employee_invite', { p_code: code })
  if (error) redirect(`/join?error=${encodeURIComponent(error.message)}`)
  redirect('/counseling')
}
