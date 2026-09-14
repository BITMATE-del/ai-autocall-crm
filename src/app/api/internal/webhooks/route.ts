import { createHmac } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET || process.env.WORKER_TOKEN
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'')
  const direct = req.headers.get('x-worker-token')
  if (!expected || (bearer !== expected && direct !== expected)) return NextResponse.json({ error:'unauthorized' }, { status:401 })

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_webhook_delivery_batch',{ p_limit:20 })
  if (error) return NextResponse.json({ error:error.message }, { status:500 })
  let delivered=0, failed=0
  for (const item of data ?? []) {
    const body=JSON.stringify({ id:item.delivery_id, type:item.event_type, created_at:new Date().toISOString(), data:item.payload })
    const signature=createHmac('sha256',item.secret).update(body).digest('hex')
    let status=0, message:string|null=null
    try {
      const res=await fetch(item.url,{method:'POST',headers:{'content-type':'application/json','x-autocall-signature':`sha256=${signature}`,'x-autocall-event':item.event_type},body,signal:AbortSignal.timeout(10000)})
      status=res.status
      if(!res.ok) message=(await res.text()).slice(0,500)
      if(res.ok) delivered++; else failed++
    } catch(e:any) { status=599; message=String(e?.message??e).slice(0,500); failed++ }
    await admin.rpc('mark_webhook_delivery',{p_delivery_id:item.delivery_id,p_http_status:status,p_error:message})
  }
  return NextResponse.json({ ok:true, processed:(data??[]).length, delivered, failed })
}
