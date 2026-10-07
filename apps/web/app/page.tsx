import Link from "next/link";
const features = [
  ["01", "Import from GitHub", "Choose repositories, a Dockerfile, branch and environment."],
  ["02", "Connect your own worker", "Build and run containers on a computer your team controls."],
  ["03", "Track every deployment", "Follow stages and logs, manage team access, and retry, cancel or roll back."],
];
export default function Home() {
  return <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 80% 10%,#202647 0,transparent 35%),var(--bg)" }}>
    <header style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", alignItems: "center", padding: "25px 6vw", borderBottom: "1px solid var(--line)" }}>
      <Link href="/" style={{ fontSize: 18, fontWeight: 800 }}><span style={{ color: "var(--green)", marginRight: 9 }}>✦</span>DeployPilot</Link>
      <nav aria-label="Main navigation" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}><Link className="dp-btn" href="/getting-started">Getting started</Link><Link className="dp-btn dp-btn-primary" href="/login">Sign in with GitHub</Link></nav>
    </header>
    <section style={{ padding: "80px 6vw 65px", maxWidth: 1150, margin: "auto" }}>
      <div className="dp-kicker" style={{ color: "var(--green)" }}>Public beta · Bring your own Docker worker</div>
      <h1 style={{ fontSize: "clamp(44px,7vw,82px)", lineHeight: 1.01, letterSpacing: "-.08em", maxWidth: 850, margin: "20px 0" }}>From GitHub push<br /><span style={{ color: "var(--green)" }}>to healthy container.</span></h1>
      <p style={{ color: "var(--muted)", fontSize: 18, lineHeight: 1.7, maxWidth: 650 }}>Import your GitHub repositories, connect a Docker worker, and manage deployments with your team from one dashboard.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}><Link className="dp-btn dp-btn-primary" href="/login">Get started with GitHub →</Link><Link className="dp-btn" href="/getting-started">How it works</Link></div>
      <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7, maxWidth: 680, marginTop: 24 }}>Vercel hosts the dashboard. Your team supplies and keeps its worker online. Apps are local to that worker until your team configures public routing; managed cloud workers and automatic public app URLs are not included.</p>
    </section>
    <section aria-label="Deployment workflow" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 13, padding: "0 6vw 60px", maxWidth: 1250, margin: "auto" }}>
      {features.map(([number, title, description]) => <article className="dp-card" key={title} style={{ padding: 23 }}><div className="dp-mono" style={{ color: "var(--green)", fontSize: 12 }}>{number}</div><h2 style={{ fontSize: 18, margin: "18px 0 9px" }}>{title}</h2><p style={{ color: "var(--muted)", lineHeight: 1.6, margin: 0, fontSize: 13 }}>{description}</p></article>)}
    </section>
    <footer style={{ padding: "24px 6vw", borderTop: "1px solid var(--line)", color: "var(--muted)", fontSize: 13 }}>Public beta · <Link href="/getting-started">Setup, data and operating limits</Link></footer>
  </main>;
}
