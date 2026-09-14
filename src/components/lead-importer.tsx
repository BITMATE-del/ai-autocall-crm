'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type ImportResult={batch_id:string,total:number,imported:number,duplicates:number,dnc:number,invalid:number}

export function LeadImporter(){
  const inputRef=useRef<HTMLInputElement>(null)
  const router=useRouter()
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState<ImportResult|null>(null)
  const [error,setError]=useState('')

  async function handleFile(file:File){
    setBusy(true);setError('');setResult(null)
    try{
      const XLSX=await import('xlsx')
      const buf=await file.arrayBuffer()
      const wb=XLSX.read(buf,{type:'array'})
      const sheet=wb.Sheets[wb.SheetNames[0]]
      const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''})
      if(!rows.length) throw new Error('업로드할 데이터가 없습니다.')
      if(rows.length>5000) throw new Error('한 번에 최대 5,000행까지 업로드할 수 있습니다.')
      const supabase=createClient() as any
      const {data,error}=await supabase.rpc('import_leads_batch',{p_filename:file.name,p_rows:rows})
      if(error) throw error
      setResult(data as ImportResult)
      router.refresh()
    }catch(e:any){setError(e?.message||'업로드 중 오류가 발생했습니다.')}
    finally{setBusy(false);if(inputRef.current)inputRef.current.value=''}
  }

  return <div>
    <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f)}}/>
    <button className="btn btnPrimary" onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?'검사 및 업로드 중...':'CSV / XLSX 업로드'}</button>
    {error&&<div style={{marginTop:10,color:'#b91c1c',fontSize:13}}>{error}</div>}
    {result&&<div className="card" style={{marginTop:12,padding:14,minWidth:320}}>
      <strong>업로드 완료</strong>
      <div className="muted" style={{fontSize:12,marginTop:6}}>전체 {result.total} · 정상 {result.imported} · 중복 {result.duplicates} · 수신거부 {result.dnc} · 오류 {result.invalid}</div>
    </div>}
  </div>
}
