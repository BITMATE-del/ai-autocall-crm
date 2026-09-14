'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Employee={id:string;name:string}
type Row={id:string;customer_name:string|null;phone_e164:string;status:string;current_assignee_id:string|null}

export function AssignmentManager({rows,employees}:{rows:Row[];employees:Employee[]}){
  const [busy,setBusy]=useState<string|null>(null)
  const router=useRouter()
  const supabase=createClient()
  async function reassign(leadId:string,employeeId:string){
    if(!employeeId)return
    setBusy(leadId)
    const {error}=await supabase.rpc('reassign_lead',{p_lead_id:leadId,p_employee_id:employeeId,p_reason:'관리자 수동 재배정'})
    setBusy(null)
    if(error){alert(error.message);return}
    router.refresh()
  }
  async function revoke(leadId:string){
    if(!confirm('이 고객 배정을 회수하시겠습니까?'))return
    setBusy(leadId)
    const {error}=await supabase.rpc('revoke_assignment',{p_lead_id:leadId,p_reason:'관리자 수동 회수'})
    setBusy(null)
    if(error){alert(error.message);return}
    router.refresh()
  }
  return <div className="card section"><table className="dataTable"><thead><tr><th>고객</th><th>전화번호</th><th>상태</th><th>현재 담당자</th><th>재배정</th><th>회수</th></tr></thead><tbody>{rows.map(r=>{const current=employees.find(e=>e.id===r.current_assignee_id)?.name||'미배정';return <tr key={r.id}><td><strong>{r.customer_name||'-'}</strong></td><td>{r.phone_e164.replace(/(\d{3})\d+(\d{4})/,'$1-****-$2')}</td><td><span className="badge">{r.status}</span></td><td>{current}</td><td><select className="select" disabled={busy===r.id} defaultValue="" onChange={e=>reassign(r.id,e.target.value)}><option value="">직원 선택</option>{employees.map(emp=><option key={emp.id} value={emp.id}>{emp.name}</option>)}</select></td><td><button className="btn" disabled={busy===r.id||!r.current_assignee_id} onClick={()=>revoke(r.id)}>{busy===r.id?'처리중':'회수'}</button></td></tr>})}{rows.length===0&&<tr><td colSpan={6} className="muted">배정된 고객이 없습니다.</td></tr>}</tbody></table></div>
}
