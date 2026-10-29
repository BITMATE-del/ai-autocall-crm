"use client";
import {useEffect,useState} from "react";
import {Download,Share2,X} from "lucide-react";
import "./CfdShareCard.css";
type Trade={id:string;symbol:string;side:string;result:string;profitKrw:number;settledAt:string};
const logo="/assets/brand/hfm-korea-original-logo.png";
const money=(n:number)=>(n>0?"+":n<0?"−":"")+Math.abs(n).toLocaleString("ko-KR")+"원";
const date=(s:string)=>new Date(s).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"});
export default function CfdShareCard({id,close}:{id:string;close:()=>void}){
 const [trade,setTrade]=useState<Trade|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setTrade(null);setError("");fetch("/api/cfd/share?id="+encodeURIComponent(id),{cache:"no-store"}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error||"거래 조회 실패");return v as Trade}).then(v=>{if(active)setTrade(v)}).catch(e=>{if(active)setError(e instanceof Error?e.message:"조회 실패")});return()=>{active=false}},[id]);
 async function makeImage(share:boolean){
  if(!trade)return;setBusy(true);setError("");
  try{
   await document.fonts.ready;const c=document.createElement("canvas");c.width=900;c.height=1125;const x=c.getContext("2d");if(!x)throw Error("이미지 생성 실패");
   const rect=(color:string,a:number,b:number,w:number,h:number)=>{x.fillStyle=color;x.fillRect(a,b,w,h)};
   const text=(value:string,a:number,b:number,size:number,color:string,weight=600)=>{x.fillStyle=color;x.font=weight+" "+size+"px 'Noto Sans KR',sans-serif";x.fillText(value,a,b)};
   rect("#f6f8fc",0,0,900,1125);rect("#172b52",0,0,900,260);rect("#3468ba",0,0,900,10);
   const img=new Image();img.src=logo;await new Promise<void>((ok,fail)=>{img.onload=()=>ok();img.onerror=()=>fail(Error("공식 로고를 읽지 못했습니다."));if(img.complete&&img.naturalWidth)ok()});
   const scale=Math.min(590/img.naturalWidth,125/img.naturalHeight);x.drawImage(img,66,62,img.naturalWidth*scale,img.naturalHeight*scale);
   text("TRADE RESULT",66,224,24,"#d8e4fa",700);
   rect("#ffffff",40,290,820,730);rect("#3468ba",40,290,820,7);
   text("CFD 거래 결과",83,373,28,"#71829e");
   text(trade.symbol,83,460,62,"#172b52",800);
   rect("#e9edf3",83,505,734,2);
   text("거래 방향",83,578,27,"#71829e");text(trade.side==="UP"?"상승":"하락",620,578,34,"#172b52",800);
   text("거래 결과",83,660,27,"#71829e");text(trade.result,620,660,40,trade.result==="WIN"?"#3468ba":trade.result==="LOSS"?"#bc4057":"#172b52",800);
   text("확정 손익",83,743,28,"#71829e");
   const amount=money(trade.profitKrw);let font=77;x.font="800 "+font+"px 'Noto Sans KR',sans-serif";while(x.measureText(amount).width>730&&font>35){font-=2;x.font="800 "+font+"px 'Noto Sans KR',sans-serif"}
   text(amount,83,848,font,trade.profitKrw<0?"#bc4057":"#3468ba",800);
   rect("#e9edf3",83,889,734,2);
   text("거래 종료",83,948,26,"#71829e");text(date(trade.settledAt),300,948,25,"#172b52");
   text("HFM KOREA",66,1080,25,"#172b52",800);
   const blob=await new Promise<Blob>((ok,fail)=>c.toBlob(b=>b?ok(b):fail(Error("PNG 생성 실패")),"image/png"));
   const filename="HFM-KOREA-CFD-"+id.slice(0,8)+".png";
   if(share&&navigator.canShare&&navigator.share){const f=new File([blob],filename,{type:"image/png"});if(navigator.canShare({files:[f]})){await navigator.share({files:[f]});return}}
   const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){if(e instanceof Error&&e.name!=="AbortError")setError(e.message)}finally{setBusy(false)}
 }
 return <div className="hfmShareOverlay" role="presentation" onClick={close}><section className="hfmShareModal" role="dialog" aria-modal="true" aria-label="거래결과 카드" onClick={e=>e.stopPropagation()}>
 <header className="hfmShareHeader"><div><strong>거래결과 카드</strong><span>확정된 거래 기록으로 생성됩니다.</span></div><button type="button" aria-label="닫기" className="hfmShareClose" onClick={close}><X size={20}/></button></header>
 {!trade&&!error&&<div className="hfmShareLoading" role="status">거래 결과를 불러오는 중입니다.</div>}
 {trade&&<div className="hfmSharePreview"><div className="hfmShareBrand"><img src={logo} alt="HFM KOREA"/></div><div className="hfmSharePaper"><span className="hfmShareEyebrow">CFD 거래 결과</span><h2>{trade.symbol}</h2><div className="hfmShareDetails"><span>거래 방향</span><strong>{trade.side==="UP"?"상승":"하락"}</strong><span>거래 결과</span><strong className={trade.result==="LOSS"?"hfmShareLoss":"hfmShareWin"}>{trade.result}</strong></div><div className="hfmShareProfit"><span>확정 손익</span><strong className={trade.profitKrw<0?"hfmShareLoss":""}>{money(trade.profitKrw)}</strong></div><div className="hfmShareDate"><span>거래 종료</span><b>{date(trade.settledAt)}</b></div></div></div>}
 {error&&<p role="alert" className="hfmShareError">{error}</p>}
 <div className="hfmShareActions"><button className="hfmShareDownload" disabled={!trade||busy} onClick={()=>void makeImage(false)}><Download size={17}/>{busy?"이미지 생성 중":"PNG 저장"}</button><button className="hfmShareSend" disabled={!trade||busy} onClick={()=>void makeImage(true)}><Share2 size={17}/>이미지 공유</button></div>
 </section></div>
}
