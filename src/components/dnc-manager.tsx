'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function DncManager(){
  const [phone,setPhone]=useState('')
  const [reason,setReason]=useState('')
  const [busy,setBusy]=useState(false)
  const router=useRouter()
  const supabase=createClient()
  async function register(){
    if(!phone.trim())return
    setBusy(true)
    const {error}=await supabase.rpc('register_dnc',{p_phone:phone,p_reason:reason||null})
    setBusy(false)
    if(error){alert(error.message);return}
    setPhone('');setReason('');router.refresh()
  }
  return <div className="card" style={{marginBottom:16}}><div className="sectionHead"><h2>수신거부 등록</h2></div><div className="toolbar"><input className="input" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="전화번호"/><input className="input" value={reason} onChange={e=>setReason(e.target.value)} placeholder="사유 (선택)"/><button className="btn btnPrimary" onClick={register} disabled={busy}>{busy?'등록중':'등록'}</button></div></div>
}

export function DncReleaseButton({id}:{id:string}){
  const [busy,setBusy]=useState(false)
  const router=useRouter();const supabase=createClient()
  async function release(){if(!confirm('수신거부를 해제하시겠습니까?'))return;setBusy(true);const {error}=await supabase.rpc('release_dnc',{p_id:id,p_reason:'관리자 수동 해제'});setBusy(false);if(error){alert(error.message);return}router.refresh()}
  return <button className="btn" disabled={busy} onClick={release}>{busy?'처리중':'해제'}</button>
}
