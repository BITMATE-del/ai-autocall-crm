'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createCompany(formData: FormData) {
  const supabase = await createClient()
  const companyName = String(formData.get('company_name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim()
  const displayName = String(formData.get('display_name') ?? '').trim()

  const { error } = await supabase.rpc('bootstrap_company_admin', {
    p_company_name: companyName,
    p_slug: slug,
    p_display_name: displayName || null,
  })

  if (error) redirect('/onboarding?error=1')
  redirect('/dashboard')
}
