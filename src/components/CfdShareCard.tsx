"use client";
import {useEffect,useState} from "react";
import {Download,Share2,X} from "lucide-react";
import "./CfdShareCard.css";
type Trade={id:string;symbol:string;side:string;result:string;profitKrw:number;settledAt:string;roiPercent?:number|null;qty?:number};
const logo="/assets/brand/hfm-korea-original-logo.png";
const money=(n:number)=>(n>0?"+":n<0?"−":"")+Math.abs(n).toLocaleString("ko-KR")+"원";
const date=(s:string)=>new Date(s).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"});
export default function CfdShareCard({id,close,kind="CFD"}:{id:string;close:()=>void;kind?:"CFD"|"STOCK"}){
 const [trade,setTrade]=useState<Trade|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setTrade(null);setError("");fetch((kind==="STOCK"?"/api/stocks/results":"/api/cfd/share")+"?id="+encodeURIComponent(id),{cache:"no-store"}).then(async r=>{const v=await r.json();if(!r.ok)throw Error(v.error||"거래 조회 실패");return v as Trade}).then(v=>{if(active)setTrade(v)}).catch(e=>{if(active)setError(e instanceof Error?e.message:"조회 실패")});return()=>{active=false}},[id,kind]);
 async function makeImage(share:boolean){
  if(!trade)return;setBusy(true);setError("");
  try{
   await document.fonts.ready;const c=document.createElement("canvas");c.width=900;c.height=1125;const x=c.getContext("2d");if(!x)throw Error("이미지 생성 실패");
   const rect=(color:string,a:number,b:number,w:number,h:number)=>{x.fillStyle=color;x.fillRect(a,b,w,h)};
   const text=(value:string,a:number,b:number,size:number,color:string,weight=600)=>{x.fillStyle=color;x.font=weight+" "+size+"px 'Noto Sans KR',sans-serif";x.fillText(value,a,b)};
   rect("#ffffff",0,0,900,1125);rect("#172b52",0,0,900,16);rect("#3468ba",0,16,900,7);
   const img=new Image();img.src=logo;await new Promise<void>((ok,fail)=>{img.onload=()=>ok();img.onerror=()=>fail(Error("공식 로고를 읽지 못했습니다."));if(img.complete&&img.naturalWidth)ok()});
   const scale=Math.min(460/img.naturalWidth,105/img.naturalHeight);x.drawImage(img,72,73,img.naturalWidth*scale,img.naturalHeight*scale);
   text(kind==="STOCK"?"STOCK  /  TRADE RESULT":"CFD  /  TRADE RESULT",72,263,24,"#71829e",700);
   text(trade.symbol,72,362,80,"#172b52",800);
   rect("#e5eaf1",72,410,756,2);
   rect("#f4f7fc",72,453,756,129);
   text("DIRECTION",101,504,21,"#7384a0",700);
   text("RESULT",510,504,21,"#7384a0",700);
   text(kind==="STOCK"?"매도 완료":trade.side==="UP"?"상승":"하락",101,555,37,"#172b52",800);
   text(trade.result,510,555,43,trade.result==="LOSS"?"#bc4057":trade.result==="WIN"?"#3468ba":"#172b52",800);
   text("확정 손익",72,688,29,"#637797",700);
   const amount=money(trade.profitKrw);let font=100;x.font="800 "+font+"px 'Noto Sans KR',sans-serif";while(x.measureText(amount).width>740&&font>40){font-=2;x.font="800 "+font+"px 'Noto Sans KR',sans-serif"}
   text(amount,72,820,font,trade.profitKrw<0?"#bc4057":"#3468ba",800);
   rect("#3468ba",72,866,90,6);
   if(kind==="STOCK"&&trade.roiPercent!==null&&trade.roiPercent!==undefined)text("확정 수익률  "+trade.roiPercent.toLocaleString("ko-KR")+"%",72,909,26,"#172b52",700);
   rect("#e5eaf1",72,931,756,2);
   text("거래 종료",72,999,25,"#71829e");
   text(date(trade.settledAt),320,999,27,"#172b52",700);
   text("HFM KOREA  ·  CONFIRMED TRADE",72,1080,22,"#91a0b4",600);
   const blob=await new Promise<Blob>((ok,fail)=>c.toBlob(b=>b?ok(b):fail(Error("PNG 생성 실패")),"image/png"));
   const filename="HFM-KOREA-CFD-"+id.slice(0,8)+".png";
   if(share&&navigator.canShare&&navigator.share){const f=new File([blob],filename,{type:"image/png"});if(navigator.canShare({files:[f]})){await navigator.share({files:[f]});return}}
   const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){if(e instanceof Error&&e.name!=="AbortError")setError(e.message)}finally{setBusy(false)}
 }
 return <div className="hfmShareOverlay" role="presentation" onClick={close}><section className="hfmShareModal" role="dialog" aria-modal="true" aria-label="거래결과 카드" onClick={e=>e.stopPropagation()}>
 <header className="hfmShareHeader"><div><strong>거래결과 카드</strong><span>확정된 거래 기록으로 생성됩니다.</span></div><button type="button" aria-label="닫기" className="hfmShareClose" onClick={close}><X size={20}/></button></header>
 {!trade&&!error&&<div className="hfmShareLoading" role="status">거래 결과를 불러오는 중입니다.</div>}
 {trade&&<div className="hfmSharePreview"><div className="hfmShareBrand"><img src={logo} alt="HFM KOREA"/></div><div className="hfmSharePaper"><div className="hfmShareEyebrow">{kind==="STOCK"?"STOCK / TRADE RESULT":"CFD / TRADE RESULT"}</div><h2>{trade.symbol}</h2><div className="hfmShareDetails"><div><span>거래 방향</span><strong>{kind==="STOCK"?"매도 완료":trade.side==="UP"?"상승":"하락"}</strong></div><div><span>거래 결과</span><strong className={trade.result==="LOSS"?"hfmShareLoss":"hfmShareWin"}>{trade.result}</strong></div></div><div className="hfmShareProfit"><span>확정 손익</span><strong className={trade.profitKrw<0?"hfmShareLoss":""}>{money(trade.profitKrw)}</strong></div>{kind==="STOCK"&&trade.roiPercent!==null&&trade.roiPercent!==undefined&&<div className="hfmShareDate"><span>확정 수익률</span><b>{trade.roiPercent.toLocaleString("ko-KR")}%</b></div>}<div className="hfmShareDate"><span>거래 종료</span><b>{date(trade.settledAt)}</b></div><div className="hfmShareSignature">HFM KOREA · CONFIRMED TRADE</div></div></div>}
 {error&&<p role="alert" className="hfmShareError">{error}</p>}
 <div className="hfmShareActions"><button className="hfmShareDownload" disabled={!trade||busy} onClick={()=>void makeImage(false)}><Download size={17}/>{busy?"이미지 생성 중":"PNG 저장"}</button><button className="hfmShareSend" disabled={!trade||busy} onClick={()=>void makeImage(true)}><Share2 size={17}/>이미지 공유</button></div>
 </section></div>
}
