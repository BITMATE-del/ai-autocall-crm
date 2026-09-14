'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createEmployeeInvite(formData: FormData) {
  const supabase = await createClient()
  const name = String(formData.get('name') || '').trim()
  const email = String(formData.get('email') || '').trim()
  const team = String(formData.get('team') || '').trim()
  if (!name) return

  const { error } = await supabase.rpc('create_employee_invite', {
    p_name: name,
    p_email: email || null,
    p_team_name: team || null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/employees')
}

export async function setEmployeeStatus(formData: FormData) {
  const supabase = await createClient()
  const id = String(formData.get('id') || '')
  const status = String(formData.get('status') || 'ACTIVE')
  if (!id) return
  const { error } = await supabase.from('employees').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/employees')
}

export async function goToJoin() {
  redirect('/join')
}
