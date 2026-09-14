export type ProviderEventStatus = 'QUEUED'|'RINGING'|'ANSWERED'|'CONSENTED'|'DECLINED'|'DNC'|'CALLBACK'|'NO_ANSWER'|'BUSY'|'FAILED'|'COMPLETED'

export type NormalizedProviderEvent = {
  queueId: string
  providerCallId?: string
  status: ProviderEventStatus
  dtmf?: string
  durationSeconds?: number
  recordingUrl?: string
  raw: unknown
}

export interface TelephonyProvider {
  name: string
  startCall(input: { queueId:string; from:string; to:string; webhookUrl:string; ttsText?:string }): Promise<{ providerCallId:string }>
  normalizeWebhook(payload: unknown): NormalizedProviderEvent
}

export class ManualProvider implements TelephonyProvider {
  name = 'manual'
  async startCall() { throw new Error('No telephony provider configured') }
  normalizeWebhook(payload: any): NormalizedProviderEvent {
    if (!payload?.queue_id || !payload?.status) throw new Error('Invalid provider payload')
    return {
      queueId: String(payload.queue_id),
      providerCallId: payload.provider_call_id ? String(payload.provider_call_id) : undefined,
      status: String(payload.status).toUpperCase() as ProviderEventStatus,
      dtmf: payload.dtmf ? String(payload.dtmf) : undefined,
      durationSeconds: payload.duration_seconds == null ? undefined : Number(payload.duration_seconds),
      recordingUrl: payload.recording_url ? String(payload.recording_url) : undefined,
      raw: payload,
    }
  }
}

export function getProvider(name:string): TelephonyProvider {
  // Vendor adapters are added here after credentials/provider selection.
  return new ManualProvider()
}
