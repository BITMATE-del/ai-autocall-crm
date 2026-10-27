"use client";
import {useEffect,useState} from "react";
type Org={id:string;name:string;type:string;username:string|null;status?:string};
const ROOT="00000000-0000-4000-8000-000000000001";
const displayName=(x:Org)=>x.type==="HQ"&&x.name.trim().toUpperCase().includes("K-MARKETS")?"HFM KOREA 본사":x.name;
const messages:Record<string,string>={INVALID_INPUT:"입력값을 확인해 주세요.",INVALID_NAME:"조직명은 2~65자로 입력해 주세요.",INVALID_USERNAME:"로그인 아이디는 영문·숫자·밑줄 4~20자로 입력해 주세요.",INVALID_PASSWORD:"초기 비밀번호는 12~128자로 입력해 주세요.",USERNAME_TAKEN:"이미 사용 중인 아이디입니다.",INVALID_ORG_PARENT:"상위 조직을 확인해 주세요.",HQ_ONLY:"부본사 생성은 본사만 가능합니다.",FORBIDDEN:"조직 생성 권한이 없습니다.",ORG_CREATE_FAILED:"조직 생성에 실패했습니다. 다시 시도해 주세요."};
export default function Organizations(){
 const [items,setItems]=useState<Org[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [type,setType]=useState("SUB_HQ"),[name,setName]=useState(""),[username,setUsername]=useState(""),[password,setPassword]=useState(""),[selected,setSelected]=useState(ROOT),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch("/api/admin/organizations",{cache:"no-store",signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error("목록 조회 실패");setItems((await r.json()).organizations||[])}catch(e){setError(String(e))}}
 useEffect(()=>{void load()},[]);
 async function create(){
  setError("");setNotice("");
  if(name.trim().length<2||name.trim().length>65){setError(messages.INVALID_NAME);return}
  if(!/^[a-zA-Z0-9_]{4,20}$/.test(username.trim())){setError(messages.INVALID_USERNAME);return}
  if(password.length<12||password.length>128){setError(messages.INVALID_PASSWORD);return}
  if(type==="AGENT"&&!selected){setError("상위 조직을 선택해 주세요.");return}
  setBusy(true);
  try{const r=await fetch("/api/admin/organizations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type,name:name.trim(),username:username.trim(),password,parentId:selected})});
   const j=await r.json();if(!r.ok)throw Error(messages[j.error]||j.error||"생성 실패");
   setName("");setUsername("");setPassword("");setNotice("조직 계정이 생성되었습니다.");await load();
  }catch(e){setError(e instanceof Error?e.message:"생성 실패")}finally{setBusy(false)}
 }
 return <><div className="am-heading"><div><h1>영업 조직 관리</h1><p>본사 → 부본사 → 영업자</p></div><button className="am-refresh" onClick={load}>새로고침</button></div>
 {error&&<div className="am-error" role="alert">{error}</div>}{notice&&<p role="status">{notice}</p>}
 <section className="am-panel"><h2>부본사 / 영업자 생성</h2>
 <div style={{display:"flex",flexWrap:"wrap",gap:9,alignItems:"center"}}>
 <select aria-label="생성할 조직 유형" value={type} onChange={e=>setType(e.target.value)}><option value="SUB_HQ">부본사</option><option value="AGENT">영업자</option></select>
 {type==="AGENT"&&<select aria-label="영업자 소속 조직" value={selected} onChange={e=>setSelected(e.target.value)}>
 <option value={ROOT}>HFM KOREA 본사 직속</option>
 {items.filter(x=>x.type==="SUB_HQ"&&(!x.status||x.status==="ACTIVE")).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
 </select>}
 <input aria-label="조직명" placeholder="조직명 (2자 이상)" maxLength={65} value={name} onChange={e=>setName(e.target.value)}/>
 <input aria-label="로그인 아이디" placeholder="로그인 아이디 (4~20자)" maxLength={20} value={username} onChange={e=>setUsername(e.target.value)}/>
 <input aria-label="초기 비밀번호" placeholder="초기 비밀번호 (12자 이상)" type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/>
 <button className="am-primary" disabled={busy} onClick={create}>{busy?"생성 중":"생성"}</button></div>
 <p style={{fontSize:12,color:"#64748b",marginTop:11}}>아이디는 영문·숫자·밑줄만 사용합니다. 비밀번호는 최소 12자로 설정해 주세요.</p></section>
 <section className="am-panel"><h2>조직 목록</h2>{items.map(x=><div key={x.id} style={{padding:12,borderBottom:"1px solid #eee"}}><strong>{displayName(x)}</strong> · {x.type==="HQ"?"본사":x.type==="SUB_HQ"?"부본사":"영업자"} · {x.username||"본사"}</div>)}</section></>
}