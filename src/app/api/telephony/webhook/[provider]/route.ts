import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProvider } from '@/lib/telephony/provider'

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider:string }> }) {
  const expected = process.env.TELEPHONY_WEBHOOK_SECRET
  if (!expected) return NextResponse.json({ error:'telephony webhook not configured' }, { status:503 })
  if (req.headers.get('x-autocall-webhook-token') !== expected) return NextResponse.json({ error:'unauthorized' }, { status:401 })

  const { provider } = await ctx.params
  const payload = await req.json()
  const event = getProvider(provider).normalizeWebhook(payload)
  const admin = createAdminClient()

  const { data: queue, error: qerr } = await admin.from('call_queue').select('id,company_id,campaign_id,lead_id,outbound_line_id').eq('id', event.queueId).maybeSingle()
  if (qerr || !queue) return NextResponse.json({ error:'queue not found' }, { status:404 })

  await admin.from('call_events').insert({ company_id:queue.company_id,campaign_id:queue.campaign_id,queue_id:queue.id,lead_id:queue.lead_id,outbound_line_id:queue.outbound_line_id,event_type:event.status,provider_call_id:event.providerCallId ?? null,payload:event.raw })
  await admin.from('call_logs').insert({ company_id:queue.company_id,queue_id:queue.id,campaign_id:queue.campaign_id,lead_id:queue.lead_id,outbound_line_id:queue.outbound_line_id,provider,provider_call_id:event.providerCallId ?? null,status:event.status,dtmf_value:event.dtmf ?? null,duration_seconds:event.durationSeconds ?? null,recording_url:event.recordingUrl ?? null,raw_payload:event.raw })
  await admin.from('call_queue').update({ status:event.status,last_attempt_at:new Date().toISOString(),updated_at:new Date().toISOString() }).eq('id',queue.id)

  if (event.status === 'CONSENTED') {
    await admin.from('leads').update({ status:'CONSENTED',updated_at:new Date().toISOString() }).eq('id',queue.lead_id)
    const { data: lead } = await admin.from('leads').select('phone_e164').eq('id',queue.lead_id).single()
    const { data: log } = await admin.from('consent_logs').insert({ company_id:queue.company_id,lead_id:queue.lead_id,phone_e164:lead?.phone_e164 ?? '',consent_status:'CONSENTED',dtmf_value:event.dtmf ?? '1',provider_call_id:event.providerCallId ?? null,server_record:event.raw }).select('id').single()
    await admin.from('consent_pool').upsert({ company_id:queue.company_id,lead_id:queue.lead_id,consent_log_id:log?.id ?? null,consented_at:new Date().toISOString() }, { onConflict:'lead_id' })
  } else if (event.status === 'DNC' || event.status === 'DECLINED') {
    const nextStatus = event.status === 'DNC' ? 'DNC' : 'DECLINED'
    await admin.from('leads').update({ status:nextStatus,updated_at:new Date().toISOString() }).eq('id',queue.lead_id)
    if (event.status === 'DNC') {
      const { data: lead } = await admin.from('leads').select('phone_e164').eq('id',queue.lead_id).single()
      if (lead?.phone_e164) await admin.from('do_not_call').upsert({ company_id:queue.company_id,phone_e164:lead.phone_e164,reason:'DTMF decline',registration_type:'AUTOMATIC' }, { onConflict:'company_id,phone_e164' })
    }
  } else if (['NO_ANSWER','BUSY'].includes(event.status)) {
    await admin.from('leads').update({ status:event.status,updated_at:new Date().toISOString() }).eq('id',queue.lead_id)
  }

  await admin.from('usage_records').insert({ company_id:queue.company_id,usage_type:'CALL_EVENT',quantity:1,reference_type:'call_queue',reference_id:queue.id,metadata:{ provider,status:event.status } })
  return NextResponse.json({ ok:true })
}
