'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function safeNext(value: FormDataEntryValue | null){
  const next=String(value||'/dashboard')
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
}

export async function login(formData: FormData) {
  const supabase = await createClient()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next=safeNext(formData.get('next'))
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect(`/login?error=1&next=${encodeURIComponent(next)}`)
  redirect(next)
}

export async function signup(formData: FormData) {
  const supabase = await createClient()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) redirect('/login?error=signup')
  if (data.session) redirect('/onboarding')
  redirect('/login?check=1')
}
