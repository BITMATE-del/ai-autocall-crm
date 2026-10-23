"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowDownLeft,ArrowUpRight,Wallet,RefreshCw,ShieldCheck,Clock3,AlertCircle,CheckCircle2} from "lucide-react";
type Kind="DEPOSIT"|"WITHDRAW";
type Item={id:string;kind:Kind;network:string;amount_usdt:string;address:string;status:string;created_at:string;tx_hash:string|null;admin_note?:string|null};
const errMessage=(s:string)=>({"CRYPTO_SERVICE_UNAVAILABLE":"현재 입출금 서비스를 이용하기 어렵습니다. 고객센터로 문의해 주세요.","CRYPTO_MIGRATION_REQUIRED":"현재 입출금 서비스를 이용할 수 없습니다.","LOGIN_REQUIRED":"로그인 후 이용할 수 있습니다.","INVALID_ADDRESS":"선택한 네트워크의 지갑 주소를 확인해 주세요.","INVALID_INTEGER_AMOUNT":"1 USDT 이상, 소수점 없이 정수로 입력해 주세요.","EXCHANGE_RATE_NOT_CONFIGURED":"환산 기준을 확인할 수 없어 신청을 진행할 수 없습니다.","BLOCKCHAIN_SETUP_PENDING":"현재 입출금 서비스를 이용할 수 없습니다.","BLOCKCHAIN_SERVICE_UNAVAILABLE":"일시적으로 입출금 서비스를 이용할 수 없습니다.","INSUFFICIENT_BALANCE":"사용 가능한 USDT 잔고가 부족합니다.","TOO_MANY_PENDING":"처리 대기 중인 신청은 최대 3건입니다.","ACCOUNT_FROZEN":"계정이 제한되어 신청할 수 없습니다."} as Record<string,string>)[s]||"요청을 처리하지 못했습니다. 다시 시도해 주세요.";
const statusText=(s:string)=>s==="APPROVED"?"처리 완료":s==="REJECTED"?"거절":"처리 대기";
const fmt=(x:string)=>Number(x||0).toLocaleString("ko-KR",{maximumFractionDigits:0});
export default function CryptoFunding(){
 const [depositAddresses,setDepositAddresses]=useState<{network:string;address:string;status:string}[]>([]),[items,setItems]=useState<Item[]>([]),[balance,setBalance]=useState("0"),[rate,setRate]=useState<number|null>(null),[kind,setKind]=useState<Kind>("DEPOSIT"),[network,setNetwork]=useState("TRC20"),[amount,setAmount]=useState(""),[address,setAddress]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[serviceReady,setServiceReady]=useState(false),[notice,setNotice]=useState(""),[success,setSuccess]=useState(false);
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch("/api/crypto",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error);setItems(j.requests||[]);setBalance(String(j.balance_krw||"0"));setRate(j.krw_per_usdt?Number(j.krw_per_usdt):null);setServiceReady(!!j.krw_per_usdt);setNotice("");}catch(e){setServiceReady(false);setNotice(errMessage(e instanceof Error?e.message:""));}finally{setLoading(false)}},[]);
 useEffect(()=>{void load();void fetch("/api/deposit-addresses",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(j=>{if(j?.addresses)setDepositAddresses(j.addresses)}).catch(()=>{})},[load]);
 async function submit(){if(!serviceReady)return;setBusy(true);setNotice("");setSuccess(false);try{const r=await fetch("/api/crypto",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,network,amount,address:address.trim()})});const j=await r.json();if(!r.ok)throw Error(j.error);setAmount("");setAddress("");await load();setSuccess(true);setNotice("신청이 접수되었습니다. 처리 상태는 최근 신청 내역에서 확인하실 수 있습니다.");}catch(e){setNotice(errMessage(e instanceof Error?e.message:""));}finally{setBusy(false)}}
 return <main className="coinShell">
 <style>{`
 .coinShell{min-height:100vh;background:#f5f7fb;color:#1b2b45;padding:34px max(24px,calc((100vw - 1160px)/2)) 90px;font-family:inherit}
 .coinShell *{box-sizing:border-box}.coinShell button,.coinShell input,.coinShell select{font:inherit}
 .coinBack{display:inline-flex;align-items:center;gap:8px;color:#536782;text-decoration:none;font-size:13px;font-weight:700;margin-bottom:24px}
 .coinHeader{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:27px}
 .coinEyebrow{font-size:12px;letter-spacing:.13em;color:#3b70bb;font-weight:800;margin:0 0 7px}
 .coinHeader h1{font-size:30px;letter-spacing:-.045em;margin:0 0 9px;font-weight:850}
 .coinMuted{font-size:14px;line-height:1.7;color:#74839a;margin:0}
 .coinRefresh{display:flex;align-items:center;gap:7px;background:#fff;border:1px solid #dfe5ef;border-radius:10px;padding:11px 15px;color:#53647e;cursor:pointer;font-weight:700;white-space:nowrap}
 .coinSummary{display:grid;grid-template-columns:1.7fr 1fr 1fr;gap:14px;margin-bottom:25px}
 .coinBalance{background:linear-gradient(125deg,#172f56,#244e87);color:#fff;border-radius:18px;padding:27px 30px;position:relative;overflow:hidden}
 .coinBalance:after{content:"";position:absolute;width:190px;height:190px;border:1px solid #ffffff20;border-radius:50%;right:-50px;top:-90px}
 .coinBalance small{color:#b6cbe7;font-weight:650;font-size:13px;display:block;margin-bottom:17px}
 .coinBalance strong{font-size:35px;font-weight:850;letter-spacing:-.03em}.coinBalance p{color:#b7c9e1;font-size:12px;margin:14px 0 0}
 .coinMetric{background:#fff;border:1px solid #e5eaf1;border-radius:18px;padding:26px}.coinMetric .coinIcon{display:inline-flex;color:#3c65a1;background:#eef3fa;padding:10px;border-radius:12px;margin-bottom:17px}
 .coinMetric small{display:block;color:#8592a5;font-size:12px;margin-bottom:7px}.coinMetric strong{font-size:17px}
 .coinGrid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(260px,.85fr);gap:17px;align-items:start}
 .coinCard{background:#fff;border:1px solid #e5eaf1;border-radius:18px;box-shadow:0 10px 24px #213d6105;padding:25px;margin-bottom:17px}
 .coinCard h2{font-size:19px;letter-spacing:-.02em;margin:0 0 8px}
 .coinTabs{display:flex;background:#f0f3f8;padding:5px;border-radius:12px;gap:4px;margin:21px 0 24px}
 .coinTabs button{flex:1;background:transparent;border:0;padding:13px 10px;border-radius:9px;color:#718098;cursor:pointer;font-size:14px;font-weight:750;display:flex;align-items:center;justify-content:center;gap:8px}
 .coinTabs button.selected{background:#fff;color:#214a83;box-shadow:0 2px 8px #263c5b16}
 .coinLabel{display:block;font-size:13px;font-weight:750;color:#394b65;margin:18px 0 8px}
 .coinField{width:100%;padding:14px 15px;border:1px solid #dce4ef;border-radius:10px;background:#fff;color:#203653;outline:0;font-size:14px}
 .coinField:focus{border-color:#4c7eb9;box-shadow:0 0 0 3px #487db616}
 .coinHelper{font-size:12px;color:#8794a6;margin:8px 0 0;line-height:1.5}
 .coinAction{background:#214d88;color:white;border:0;border-radius:11px;width:100%;padding:16px;cursor:pointer;font-weight:800;margin-top:24px}
 .coinAction:disabled{background:#abb6c5;cursor:not-allowed}
 .coinInfo{background:#f5f8fc;border:1px solid #e5edf6;border-radius:13px;padding:18px;margin-top:17px}
 .coinInfo h3{font-size:14px;margin:0 0 9px;color:#294e7e}.coinInfo p{font-size:12px;color:#73849a;line-height:1.8;margin:0}
 .coinInfo a{color:#245791;text-decoration:none;font-weight:700}
 .coinNotice{display:flex;gap:10px;background:#fff6f2;color:#975c37;border:1px solid #f2dfd2;border-radius:11px;padding:14px;font-size:13px;line-height:1.5;margin-bottom:17px}
 .coinNotice.ok{background:#effaf5;color:#267251;border-color:#cfe8d9}
 .coinHistory{margin-top:5px}.coinHistoryHeader{display:flex;align-items:center;justify-content:space-between;gap:15px;margin-bottom:18px}
 .coinHistoryHeader p{color:#8693a6;font-size:12px;margin:5px 0 0}.coinCount{font-size:12px;background:#edf2f8;border-radius:100px;padding:6px 10px;color:#5a6f8c;font-weight:750}
 .coinTableWrap{overflow-x:auto}.coinTable{width:100%;border-collapse:collapse;min-width:650px;text-align:left}
 .coinTable th{padding:12px 10px;background:#f7f9fc;color:#8b97aa;font-size:12px;font-weight:700}
 .coinTable td{padding:17px 10px;border-bottom:1px solid #edf0f4;font-size:13px;color:#465772}
 .coinTable td strong{color:#243751}.coinStatus{font-size:11px;font-weight:800;padding:6px 9px;border-radius:8px;white-space:nowrap}
 .coinStatus.PENDING{background:#fff6e6;color:#a06e17}.coinStatus.APPROVED{background:#e9f8f1;color:#218058}.coinStatus.REJECTED{background:#ffeded;color:#b44d4d}
 .coinEmpty{text-align:center;color:#9aa5b4;padding:42px 0;font-size:13px}
 @media(max-width:850px){.coinSummary{grid-template-columns:1fr 1fr}.coinBalance{grid-column:1/-1}.coinGrid{grid-template-columns:1fr}}
 @media(max-width:560px){.coinShell{padding:23px 15px 65px}.coinHeader h1{font-size:25px}.coinHeader{align-items:flex-start}.coinRefresh{padding:10px}.coinSummary{gap:9px}.coinMetric{padding:16px}.coinMetric strong{font-size:14px}.coinBalance{padding:23px}.coinBalance strong{font-size:28px}.coinCard{padding:18px}}
 `}</style>
 <Link href="/assets" className="coinBack"><ArrowLeft size={15}/> 내 자산으로 돌아가기</Link>
 <header className="coinHeader"><div><p className="coinEyebrow">DIGITAL ASSET</p><h1>블록체인 입출금</h1><p className="coinMuted">원화와 블록체인 입출금을 하나의 통합 자산으로 관리합니다.</p></div><button className="coinRefresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> 새로고침</button></header>
 <div className="coinSummary"><section className="coinBalance"><small>통합 보유 자산</small><strong>{fmt(balance)} <span style={{fontSize:17,fontWeight:600}}>KRW</span></strong><p>원화·블록체인 입출금이 동일한 자산에 반영됩니다.</p></section><section className="coinMetric"><span className="coinIcon"><Wallet size={20}/></span><small>지원 자산</small><strong>Tether (USDT)</strong></section><section className="coinMetric"><span className="coinIcon"><ShieldCheck size={20}/></span><small>지원 네트워크</small><strong>TRC20 · ERC20</strong></section></div>
 {notice&&<div role="status" className={"coinNotice"+(success?" ok":"")} >{success?<CheckCircle2 size={18}/>:<AlertCircle size={18}/>}<span>{notice}</span></div>}
 <section className="coinCard"><h2>내 블록체인 입금주소</h2><p className="coinMuted">입금 전에 네트워크와 지갑 주소를 정확히 확인해 주세요.</p>{depositAddresses.filter(x=>x.status==="ACTIVE").length?depositAddresses.filter(x=>x.status==="ACTIVE").map(x=><div key={x.network} className="coinInfo"><h3>USDT {x.network}</h3><p style={{wordBreak:"break-all",fontSize:15,fontWeight:750,color:"#214d88"}}>{x.address}</p><button className="coinRefresh" style={{marginTop:10}} onClick={()=>void navigator.clipboard.writeText(x.address)}>주소 복사</button></div>):<div className="coinInfo"><h3>입금주소 준비 중</h3><p>현재 이용 가능한 입금주소가 없습니다. 고객센터에서 안내를 받으신 후 입금을 진행해 주세요.</p></div>}</section><div className="coinGrid"><section className="coinCard"><h2>입출금 신청</h2><p className="coinMuted">입출금 신청 후 처리 상태를 확인하실 수 있습니다.</p>
 <div className="coinTabs"><button type="button" className={kind==="DEPOSIT"?"selected":""} onClick={()=>{setKind("DEPOSIT");setNotice("");setSuccess(false)}}><ArrowDownLeft size={17}/> 블록체인 입금</button><button type="button" className={kind==="WITHDRAW"?"selected":""} onClick={()=>{setKind("WITHDRAW");setNotice("");setSuccess(false)}}><ArrowUpRight size={17}/> 블록체인 출금</button></div>
 <label className="coinLabel" htmlFor="coinNetwork">네트워크 선택</label><select id="coinNetwork" className="coinField" value={network} onChange={e=>{setNetwork(e.target.value);setAddress("")}}><option value="TRC20">TRC20 · Tron</option><option value="ERC20">ERC20 · Ethereum</option></select>
 <label className="coinLabel" htmlFor="coinAmount">{kind==="DEPOSIT"?"입금":"출금"}액 (USDT)</label><input id="coinAmount" className="coinField" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} placeholder="예: 100"/><p className="coinHelper">최소 1 USDT · 정수 단위로 입력{rate?` · 적용 환산 기준 · 1 USDT = ${rate.toLocaleString("ko-KR")}원`:""}</p>{rate&&amount&&/^[1-9]\d*$/.test(amount)&&<div className="coinInfo"><h3>통합 자산 반영 예정액</h3><p style={{fontSize:20,fontWeight:800,color:"#214d88"}}>{(BigInt(amount)*BigInt(rate)).toLocaleString("ko-KR")} KRW</p><p>신청 시 표시된 환산 기준으로 금액이 산정되며, 처리 완료 후 잔고에 반영됩니다.</p></div>}
 <label className="coinLabel" htmlFor="coinAddress">{kind==="DEPOSIT"?"송금하는 본인 지갑 주소":"수령할 지갑 주소"}</label><input id="coinAddress" className="coinField" value={address} onChange={e=>setAddress(e.target.value.trim())} placeholder={network==="TRC20"?"T로 시작하는 Tron 지갑 주소":"0x로 시작하는 Ethereum 지갑 주소"}/>
 <p className="coinHelper">네트워크와 주소가 일치하는지 반드시 확인해 주세요.</p>
 <button className="coinAction" disabled={!serviceReady||busy||!amount||!address||!/^[1-9]\d*$/.test(amount)} onClick={()=>void submit()}>{busy?"접수 중...":kind==="DEPOSIT"?"입금 신청하기":"출금 신청하기"}</button>
 </section><aside><section className="coinCard"><h2>이용 안내</h2><div className="coinInfo"><h3>01. 공식 주소 확인</h3><p>입금할 네트워크와 지갑 주소를 먼저 확인해 주세요. 주소가 표시되지 않으면 <Link href="/support">고객센터</Link>에 문의하세요.</p></div><div className="coinInfo"><h3>02. 입금·출금 확인</h3><p>입출금은 신청 접수 후 확인 절차를 거쳐 처리됩니다. 신청 즉시 블록체인 전송이나 잔고 반영이 완료되는 것은 아닙니다.</p></div><div className="coinInfo"><h3>03. 네트워크 주의</h3><p>잘못된 주소나 네트워크로 전송하면 자산을 되찾지 못할 수 있습니다. 송금 전 다시 확인해 주세요.</p></div></section></aside></div>
 <section className="coinCard coinHistory"><div className="coinHistoryHeader"><div><h2>최근 신청 내역</h2><p>신청 상태와 처리 내역을 확인할 수 있습니다.</p></div><span className="coinCount">전체 {items.length}건</span></div><div className="coinTableWrap"><table className="coinTable"><thead><tr><th>신청일시</th><th>유형</th><th>네트워크</th><th>금액</th><th>상태</th><th>거래 해시</th></tr></thead><tbody>{items.map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString("ko-KR")}</td><td>{x.kind==="DEPOSIT"?"입금":"출금"}</td><td>{x.network}</td><td><strong>{fmt(x.amount_usdt)} USDT</strong></td><td><span className={"coinStatus "+x.status}>{statusText(x.status)}</span></td><td>{x.tx_hash?<span title={x.tx_hash}>{x.tx_hash.slice(0,9)}…</span>:"—"}</td></tr>)}</tbody></table>{items.length===0&&<div className="coinEmpty"><Clock3 size={24} style={{display:"block",margin:"0 auto 12px"}}/>신청 내역이 없습니다.</div>}</div></section>
 </main>
}