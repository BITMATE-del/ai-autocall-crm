'use client'
import { useEffect,useState } from 'react'
import { PageShell } from '@/components/page-shell'
import { createClient } from '@/lib/supabase/client'

export default function Page(){
 const supabase=createClient(); const [keys,setKeys]=useState<any[]>([]); const [hooks,setHooks]=useState<any[]>([]); const [shown,setShown]=useState('')
 const load=async()=>{const [{data:k},{data:w}]=await Promise.all([supabase.from('api_keys').select('id,name,key_prefix,scopes,created_at,last_used_at,revoked_at').order('created_at',{ascending:false}),supabase.from('webhooks').select('id,name,url,events,active,secret_prefix,created_at').order('created_at',{ascending:false})]);setKeys(k??[]);setHooks(w??[])}
 useEffect(()=>{load()},[])
 const mkKey=async()=>{const name=prompt('API Key 이름'); if(!name)return; const {data,error}=await supabase.rpc('create_api_key',{p_name:name,p_scopes:['read','write']}); if(error)return alert(error.message); setShown((data as any)?.key??''); load()}
 const mkHook=async()=>{const name=prompt('Webhook 이름'); const url=prompt('HTTPS URL'); if(!name||!url)return; const {data,error}=await supabase.rpc('create_webhook',{p_name:name,p_url:url,p_events:['lead.consented','lead.assigned','counseling.completed']}); if(error)return alert(error.message); setShown((data as any)?.secret??''); load()}
 return <PageShell title="API / Webhook" eyebrow="Integrations"><div className="grid"><div className="card"><div className="sectionHead"><h2>API Keys</h2><button className="btn btnPrimary" onClick={mkKey}>키 생성</button></div>{shown&&<div className="notice">지금 한 번만 표시됩니다: <code>{shown}</code></div>}<table className="dataTable"><thead><tr><th>이름</th><th>Prefix</th><th>Scopes</th><th>상태</th></tr></thead><tbody>{keys.map(k=><tr key={k.id}><td>{k.name}</td><td>{k.key_prefix}</td><td>{k.scopes?.join(', ')}</td><td>{k.revoked_at?'REVOKED':'ACTIVE'}</td></tr>)}</tbody></table></div><div className="card"><div className="sectionHead"><h2>Webhooks</h2><button className="btn btnPrimary" onClick={mkHook}>Webhook 추가</button></div><table className="dataTable"><thead><tr><th>이름</th><th>URL</th><th>이벤트</th><th>상태</th></tr></thead><tbody>{hooks.map(h=><tr key={h.id}><td>{h.name}</td><td>{h.url}</td><td>{h.events?.join(', ')}</td><td>{h.active?'ACTIVE':'OFF'}</td></tr>)}</tbody></table></div></div></PageShell>
}
