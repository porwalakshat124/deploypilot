"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useState } from "react";
import { RepositoryProvider } from "./repository-context";
import { ToastProvider } from "./feedback";
import { useApiResource } from "../../lib/use-api-resource";
import { logoutAccount } from "../../lib/github-login";

const nav = [
  ["Overview", "/dashboard", "◈"], ["Repositories", "/dashboard/repositories", "⌘"], ["Deployments", "/dashboard/deployments", "↗"],
  ["Environments", "/dashboard/environments", "◇"], ["Workers", "/dashboard/workers", "▣"], ["Logs", "/dashboard/logs", "≋"], ["AI Assistant", "/dashboard/ai", "✦"], ["Queue", "/dashboard/queue", "≡"], ["Teams", "/dashboard/teams", "♧"], ["Settings", "/dashboard/settings", "⚙"],
];
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: account } = useApiResource<{ displayName: string; email: string }>("/v1/me");
  const accountName = account?.displayName || account?.email || "Your account";
  const pathname = usePathname();
  const [authBusy,setAuthBusy]=useState(false), [authError,setAuthError]=useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => { setSidebarOpen(false); }, [pathname]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);
  const signOut = async (switchAccount=false) => {
    setAuthBusy(true); setAuthError("");
    try { const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); await logoutAccount(supabase); window.location.replace(switchAccount ? "/login?switch=1" : "/login"); }
    catch(error) { setAuthError(error instanceof Error ? error.message : "Unable to sign out"); setAuthBusy(false); }
  };
  return <ToastProvider><RepositoryProvider><a className="dp-skip-link" href="#dashboard-content">Skip to content</a><div className="dp-shell" style={{ minHeight:"100vh", display:"grid", gridTemplateColumns:"232px 1fr" }}>
    <button className={`dp-sidebar-backdrop${sidebarOpen ? " is-visible" : ""}`} aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />
    <aside id="dashboard-navigation" className={`dp-sidebar${sidebarOpen ? " is-open" : ""}`} aria-label="Main navigation" style={{ borderRight:"1px solid var(--line)", background:"#0d1016", padding:"25px 14px", position:"sticky", top:0, height:"100vh", display:"flex", flexDirection:"column" }}>
      <div className="dp-brand"><button className="dp-menu-button" type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}><span aria-hidden="true">☰</span></button><Link href="/dashboard" style={{ display:"flex", alignItems:"center", gap:10, padding:"0 10px 26px" }}><span style={{ color:"var(--green)", fontSize:22 }}>✦</span><span style={{ fontWeight:800, fontSize:17, letterSpacing:"-.04em" }}>DeployPilot</span></Link></div>
      <div className="dp-kicker" style={{ padding:"0 11px 10px" }}>Workspace</div>
      <nav className="dp-nav" style={{ display:"grid", gap:3 }}>{nav.map(([label,href,icon]) => { const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href)); return <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setSidebarOpen(false)} style={{ display:"flex", alignItems:"center", gap:11, padding:"10px 11px", borderRadius:8, color:active?"var(--text)":"var(--muted)", background:active?"#1c2532":"transparent", fontWeight:active?700:600, transition:"background .18s,color .18s" }}><span style={{ color:active?"var(--green)":"#778195", width:16, textAlign:"center" }}>{icon}</span>{label}</Link>; })}</nav>
      <div style={{ marginTop:"auto", borderTop:"1px solid var(--line)", paddingTop:18 }}><div style={{ display:"flex", gap:10, alignItems:"center", padding:"10px 8px" }}><div style={{ width:30,height:30,borderRadius:"50%",background:"#29344a",display:"grid",placeItems:"center",fontSize:12 }}>{accountName.slice(0, 2).toUpperCase()}</div><div style={{ minWidth:0 }}><div style={{ fontWeight:700,fontSize:12 }}>{accountName}</div><div style={{ color:"var(--muted)",fontSize:11 }}>Team-owned workers</div></div></div><button className="dp-btn" disabled={authBusy} onClick={()=>void signOut(true)} style={{width:"100%",marginTop:8,fontSize:12}}>Switch GitHub account</button><button className="dp-btn" disabled={authBusy} onClick={()=>void signOut()} style={{ width:"100%", marginTop:8, fontSize:12 }}>Sign out</button>{authError && <p role="alert" style={{color:"var(--red)",fontSize:12}}>{authError}</p>}</div>
    </aside>
    <main id="dashboard-content" tabIndex={-1} className="dp-main" style={{ minWidth:0, padding:"30px 38px 60px", maxWidth:1500, width:"100%" }}><div className="dp-mobile-header"><button className="dp-menu-button" type="button" aria-label="Open navigation" aria-controls="dashboard-navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}><span aria-hidden="true">☰</span></button><Link href="/dashboard" className="dp-mobile-brand"><span aria-hidden="true">✦</span>DeployPilot</Link></div>{children}</main>
  </div></RepositoryProvider></ToastProvider>;
}
