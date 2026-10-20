import {NextRequest,NextResponse} from "next/server";
import {createSession,register,throttle} from "@/lib/auth";
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
const banks=new Set(["KB국민은행","신한은행","우리은행","하나은행","NH농협은행","IBK기업은행","SC제일은행","카카오뱅크","케이뱅크","토스뱅크","부산은행","대구은행","경남은행","광주은행","전북은행","제주은행","수협은행","우체국","새마을금고","신협"]);
export async function POST(req:NextRequest){try{
const origin=req.headers.get("origin");if(origin&&new URL(origin).host!==req.nextUrl.host)return fail("잘못된 요청입니다.",403);
const clientIp=(req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();const limited=await throttle("signup-ip",clientIp,5,3600);if(!limited.allowed)return NextResponse.json({error:"회원가입 요청이 많습니다. 잠시 후 다시 시도해주세요."},{status:429,headers:{"Retry-After":String(limited.retryAfter)}});const b=await req.json();
const username=String(b.username||"").trim(),password=String(b.password||""),confirm=String(b.confirm||""),legalName=String(b.name||"").trim(),birth=String(b.birth||"").trim(),phone=String(b.phone||"").replace(/[-\s]/g,""),referral=String(b.referrer||"").trim(),bank=String(b.bank||""),account=String(b.account||"").replace(/[\s-]/g,""),holder=String(b.holder||"").trim();
if(!/^[a-zA-Z0-9_]{4,20}$/.test(username))return fail("아이디는 영문, 숫자, 밑줄 4~20자로 입력하세요.");
if(password.length<10||password.length>128||password!==confirm)return fail("비밀번호는 10자 이상이어야 하며 확인값과 일치해야 합니다.");
if(legalName.length<2||legalName.length>50||/[<>]/.test(legalName))return fail("실명을 확인해주세요.");
if(!/^\d{8}$/.test(birth))return fail("생년월일을 8자리로 입력하세요.");
const year=Number(birth.slice(0,4)),month=Number(birth.slice(4,6)),day=Number(birth.slice(6));const parsed=new Date(Date.UTC(year,month-1,day));
if(year<1900||parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day||parsed.getTime()>Date.now())return fail("유효한 생년월일을 입력하세요.");
if(!/^01\d{8,9}$/.test(phone))return fail("전화번호를 확인해주세요.");
if(referral.length>40||!banks.has(bank))return fail("추천인 또는 은행 선택을 확인해주세요.");
if(!/^\d{8,20}$/.test(account))return fail("계좌번호는 숫자 8~20자리로 입력하세요.");
if(holder!==legalName)return fail("예금주와 신청자 실명이 일치해야 합니다.");
if(b.consent!==true)return fail("개인정보 수집 및 이용에 동의해주세요.");
const u=await register({username,password,legalName,birthDate:birth.slice(0,4)+"-"+birth.slice(4,6)+"-"+birth.slice(6),phone,referral,bank,account,holder});
await createSession(u);return NextResponse.json({user:u},{status:201})
}catch(e){if((e as {code?:string}).code==="23505")return fail("이미 사용 중인 아이디입니다.",409);return fail("가입 처리 중 문제가 발생했습니다.",500)}}
