"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {UserRound} from "lucide-react";
type Props={className?:string;style?:React.CSSProperties;children?:React.ReactNode};
export default function ProfileShortcut({className,style,children}:Props){
 const [signedIn,setSignedIn]=useState(false);
 useEffect(()=>{let active=true;fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(d=>{if(active)setSignedIn(Boolean(d?.user?.id))}).catch(()=>{});return()=>{active=false}},[]);
 return <Link href={signedIn?"/assets":"/auth"} title={signedIn?"내 자산 · 마이페이지":"로그인 / 회원가입"} className={className} style={style}>{children||<UserRound size={17}/>}</Link>;
}
