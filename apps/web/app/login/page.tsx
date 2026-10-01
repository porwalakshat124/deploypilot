"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { githubLogin } from "../../lib/github-login";
export default function LoginPage() {
  const router=useRouter();
  const [error,setError]=useState(""), [busy,setBusy]=useState(false), [switching,setSwitching]=useState(false);
  useEffect(()=>{
    const switchAccount=new URLSearchParams(window.location.search).get("switch")==="1";
    setSwitching(switchAccount);
    const client=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    if(!switchAccount) void client.auth.getSession().then(({data})=>{if(data.session)router.replace("/dashboard");});
  },[router]);
  const signIn=async()=>{
    setBusy(true);setError("");
    try { const client=createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); await githubLogin(client,window.location.origin); }
    catch(error) {setError(error instanceof Error ? error.message : "Unable to sign in");setBusy(false);}
  };
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"radial-gradient(circle at 50% 20%,#1b253f 0,transparent 45%),var(--bg)"}}><div style={{width:"100%",maxWidth:430}}><Link href="/" style={{display:"block",textAlign:"center",fontSize:19,fontWeight:800,marginBottom:30}}><span style={{color:"var(--green)",marginRight:9}}>✦</span>DeployPilot</Link><section className="dp-card" style={{padding:30}}><div className="dp-kicker">Secure access</div><h1 style={{fontSize:27,letterSpacing:"-.06em",margin:"12px 0 9px"}}>{switching ? "Choose another GitHub account" : "Sign in to your control room"}</h1><p style={{color:"var(--muted)",lineHeight:1.6,fontSize:13}}>Use GitHub to connect your repositories and manage deployments on infrastructure you own.</p><button className="dp-btn dp-btn-primary" disabled={busy} onClick={()=>void signIn()} style={{width:"100%",marginTop:16}}>{busy ? "Opening GitHub…" : "Choose GitHub account"}<span style={{float:"right"}}>↗</span></button>{error&&<p role="alert" style={{color:"var(--red)",fontSize:12}}>{error}</p>}<p style={{color:"var(--muted)",fontSize:12,lineHeight:1.6,marginTop:18}}>Choose an account on GitHub, or select Use a different account to sign in with another username.</p><p style={{color:"var(--muted)",fontSize:11,lineHeight:1.5,marginTop:22}}>Your GitHub password stays with GitHub. Signing out clears this browser’s DeployPilot session.</p></section><Link href="/" style={{display:"block",textAlign:"center",color:"var(--muted)",fontSize:12,marginTop:20}}>← Back to DeployPilot</Link></div></main>;
}
