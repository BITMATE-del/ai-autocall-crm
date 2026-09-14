'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function PoolAssigner({employees}:{employees:{id:string,name:string}[]}){
  const router=useRouter()
  const [employeeId,setEmployeeId]=useState(employees[0]?.id||'')
  const [count,setCount]=useState(10)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')

  async function assign(){
    if(!employeeId)return
    setBusy(true);setMessage('')
    const supabase=createClient() as any
    const {data,error}=await supabase.rpc('assign_pool_leads',{p_employee_id:employeeId,p_limit:count})
    if(error)setMessage(error.message)
    else{setMessage(`${data?.assigned??0}건 배정 완료`);router.refresh()}
    setBusy(false)
  }

  return <div className="toolbar">
    <select className="select" value={employeeId} onChange={e=>setEmployeeId(e.target.value)} disabled={!employees.length||busy}>
      {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
      {!employees.length&&<option>활성 직원 없음</option>}
    </select>
    <input className="input" type="number" min={1} max={1000} value={count} onChange={e=>setCount(Math.max(1,Math.min(1000,Number(e.target.value)||1)))} style={{width:90}}/>
    <button className="btn btnPrimary" onClick={assign} disabled={!employees.length||busy}>{busy?'배정 중...':'수량 배정'}</button>
    {message&&<span className="muted" style={{alignSelf:'center',fontSize:12}}>{message}</span>}
  </div>
}
