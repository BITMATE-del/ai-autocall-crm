'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function GatewayTestCall(){
  const [phone,setPhone]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const router=useRouter()

  async function queue(){
    setBusy(true);setMessage('')
    try{
      const supabase=createClient() as any
      const {data,error}=await supabase.rpc('queue_gateway_test_call',{p_phone:phone})
      if(error) throw error
      setMessage(`실발신 Queue 등록 완료 · ${String(data?.queue_id||'').slice(0,8)}`)
      setPhone('')
      router.refresh()
    }catch(e:any){
      setMessage(e?.message||'실발신 등록 실패')
    }finally{setBusy(false)}
  }

  return <div className="card section">
    <div className="sectionHead"><div><h2>실발신 테스트</h2><div className="muted">연결된 Android Agent가 이 번호를 가져가 실제 SIM으로 발신합니다.</div></div><span className="badge badgeGreen">REAL DEVICE</span></div>
    <div className="toolbar">
      <input className="input" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="테스트 받을 전화번호"/>
      <button className="btn btnPrimary" type="button" disabled={busy||!phone.trim()} onClick={queue}>{busy?'Queue 등록 중...':'실제 발신 Queue 등록'}</button>
    </div>
    {message&&<div style={{marginTop:10,fontSize:13}}>{message}</div>}
    <div className="muted" style={{fontSize:12,marginTop:10}}>수신거부 번호는 서버에서 차단됩니다. 실제 소유/사용권한이 있는 SIM 단말로만 테스트하세요.</div>
  </div>
}
