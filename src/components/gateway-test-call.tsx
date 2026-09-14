'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function GatewayTestCall({registeredDevices,onlineDevices}:{registeredDevices:number;onlineDevices:number}){
  const [phone,setPhone]=useState('')
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const router=useRouter()
  const ready=onlineDevices>0

  async function queue(){
    if(!ready){setMessage('온라인 상태의 Gateway 단말이 없어 실발신을 시작할 수 없습니다.');return}
    setBusy(true);setMessage('')
    try{
      const supabase=createClient() as any
      const {data,error}=await supabase.rpc('queue_gateway_test_call',{p_phone:phone})
      if(error) throw error
      setMessage(`실발신 Queue 등록 완료 · ${String(data?.queue_id||'').slice(0,8)} · 연결된 단말이 최대 8초 안에 작업을 가져갑니다.`)
      setPhone('')
      router.refresh()
    }catch(e:any){
      setMessage(e?.message||'실발신 등록 실패')
    }finally{setBusy(false)}
  }

  return <div className="card section">
    <div className="sectionHead">
      <div><h2>실발신 테스트</h2><div className="muted">실제 온라인 Android Agent가 있을 때만 Queue 등록 버튼이 활성화됩니다.</div></div>
      <span className={`badge ${ready?'badgeGreen':'badgeAmber'}`}>{ready?'READY':'NOT READY'}</span>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:14}}>
      <div className="card" style={{padding:12}}><div className="kpiLabel">등록 단말</div><strong>{registeredDevices}대</strong></div>
      <div className="card" style={{padding:12}}><div className="kpiLabel">온라인 단말</div><strong>{onlineDevices}대</strong></div>
      <div className="card" style={{padding:12}}><div className="kpiLabel">실발신 가능</div><strong>{ready?'가능':'불가'}</strong></div>
    </div>

    {!ready&&<div style={{padding:12,border:'1px solid #f59e0b',borderRadius:10,marginBottom:12,fontSize:13}}>
      {registeredDevices===0?'먼저 아래에서 Gateway 단말을 등록하고 APK에서 페어링 코드를 입력하세요.':'등록된 단말이 아직 온라인이 아닙니다. APK를 실행하고 자동 발신을 시작하면 상태가 ONLINE으로 바뀝니다.'}
    </div>}

    <div className="toolbar">
      <input className="input" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="실제로 받을 테스트 전화번호" disabled={!ready}/>
      <button className="btn btnPrimary" type="button" disabled={!ready||busy||!phone.trim()} onClick={queue}>{busy?'Queue 등록 중...':'실제 발신 Queue 등록'}</button>
    </div>
    {message&&<div style={{marginTop:10,fontSize:13}}>{message}</div>}
    <div className="muted" style={{fontSize:12,marginTop:10}}>표시되는 상태와 숫자는 모두 실제 DB/단말 상태만 사용합니다. 연결된 단말이 없으면 테스트를 실행하지 않습니다.</div>
  </div>
}
