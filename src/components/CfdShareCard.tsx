"use client";
import {useEffect,useState} from "react";
type T={id:string;symbol:string;side:string;result:string;profitKrw:number;roiPercent:number;settledAt:string};
export default function CfdShareCard({id,close}:{id:string;close:()=>void}){
 const [trade,setTrade]=useState<T|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch("/api/cfd/share?id="+encodeURIComponent(id),{cache:"no-store"}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error);setTrade(v)}).catch(e=>setError(String(e)))},[id]);
 async function makeImage(share:boolean){
  if(!trade)return;setBusy(true);setError("");
  try{
   await document.fonts.ready;const c=document.createElement("canvas");c.width=900;c.height=1125;const x=c.getContext("2d");if(!x)throw Error("이미지 생성 실패");
   x.fillStyle="#fff";x.fillRect(0,0,900,1125);x.fillStyle="#172b52";x.fillRect(0,0,900,20);x.fillStyle="#3468ba";x.fillRect(0,20,900,10);
   const logo=new Image();logo.src="/assets/brand/hfm-korea-original-logo.png";
   await new Promise<void>((ok,fail)=>{logo.onload=()=>ok();logo.onerror=()=>fail(Error("로고 오류"));if(logo.complete&&logo.naturalWidth)ok()});
   const scale=Math.min(570/logo.naturalWidth,120/logo.naturalHeight);x.drawImage(logo,65,65,logo.naturalWidth*scale,logo.naturalHeight*scale);
   const label=(t:string,y:number,size=27,color="#71829e")=>{x.fillStyle=color;x.font="600 "+size+"px sans-serif";x.fillText(t,65,y)};
   label("CFD 거래 결과",260);label(trade.symbol,345,62,"#172b52");x.fillStyle="#3468ba";x.fillRect(65,400,770,2);
   label("거래 방향",475);x.fillStyle="#172b52";x.font="700 35px sans-serif";x.fillText(trade.side==="UP"?"상승":"하락",610,475);
   label("거래 결과",555);x.fillStyle="#3468ba";x.font="700 40px sans-serif";x.fillText(trade.result,610,555);
   label("확정 손익",650);const profit=(trade.profitKrw>0?"+":"")+trade.profitKrw.toLocaleString("ko-KR")+"원";
   let size=70;x.font="800 "+size+"px sans-serif";while(x.measureText(profit).width>770&&size>35){size-=2;x.font="800 "+size+"px sans-serif"}x.fillStyle="#3468ba";x.fillText(profit,65,745);
   label("수익률 "+trade.roiPercent+"%",835,32,"#172b52");
   label(new Date(trade.settledAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}),930,27);
   label("확정된 거래 결과",1030,23);
   const blob=await new Promise<Blob>((ok,fail)=>c.toBlob(b=>b?ok(b):fail(Error("PNG 오류")),"image/png"));
   const filename="HFM-KOREA-CFD-"+id.slice(0,8)+".png";
   if(share&&navigator.canShare&&navigator.share){const f=new File([blob],filename,{type:"image/png"});if(navigator.canShare({files:[f]})){await navigator.share({files:[f]});return}}
   const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }catch(e){if(e instanceof Error&&e.name!=="AbortError")setError(e.message)}finally{setBusy(false)}
 }
 return <div role="presentation" onClick={close} style={{position:"fixed",inset:0,zIndex:3000,background:"#172b52aa",display:"grid",placeItems:"center",padding:16}}>
 <section role="dialog" aria-modal="true" aria-label="수익인증 공유" onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:14,padding:22,width:"min(100%,440px)",color:"#172b52"}}>
 <div style={{display:"flex",justifyContent:"space-between"}}><strong>거래 결과 카드</strong><button onClick={close}>닫기</button></div>
 {!trade&&!error&&<p>확정 거래 조회 중...</p>}
 {trade&&<div style={{border:"1px solid #e9edf3",borderTop:"5px solid #3468ba",padding:20,margin:"16px 0",borderRadius:10}}>
 <img src="/assets/brand/hfm-korea-original-logo.png" alt="HFM KOREA" style={{maxWidth:190,maxHeight:65,objectFit:"contain"}}/>
 <p>CFD 거래 결과</p><h2>{trade.symbol}</h2><p>{trade.side==="UP"?"상승":"하락"} · {trade.result}</p>
 <p>확정 손익</p><strong style={{fontSize:30,color:"#3468ba"}}>{trade.profitKrw>0?"+":""}{trade.profitKrw.toLocaleString("ko-KR")}원</strong>
 <p>수익률 {trade.roiPercent}%</p><small>{new Date(trade.settledAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})}</small></div>}
 {error&&<p role="alert">{error}</p>}
 <div style={{display:"flex",gap:8}}><button disabled={!trade||busy} onClick={()=>void makeImage(false)}>PNG 저장</button><button disabled={!trade||busy} onClick={()=>void makeImage(true)}>이미지 공유</button></div>
 </section></div>
}
