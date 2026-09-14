'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=1')
  redirect('/dashboard')
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
