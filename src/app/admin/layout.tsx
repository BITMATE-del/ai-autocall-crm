import "./admin.css";
import type {ReactNode} from "react";
import {redirect} from "next/navigation";
import {currentAdminSession,currentUser,isAdmin} from "@/lib/auth";
import AdminShell from "./shell";

async function checkLegacyAdminSession():Promise<boolean>{
  // Legacy member sessions require DB role confirmation. Bound the fallback
  // so a stalled database does not leave the administrator in a loading state.
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    return await Promise.race([
      (async()=>{const user=await currentUser();return !!(user?.id&&await isAdmin(user.id))})(),
      new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),5500)}),
    ]);
  }finally{if(timer)clearTimeout(timer)}
}

export default async function Layout({children}:{children:ReactNode}){
  if(process.env.KM_SERVICE_MODE!=="admin")redirect("/admin/login");
  const u=await currentAdminSession();
  if(!u?.id&&!(await checkLegacyAdminSession()))redirect("/admin/login");
  return <AdminShell>{children}</AdminShell>;
}
