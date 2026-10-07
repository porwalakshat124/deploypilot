import Link from "next/link";
import { jsonLd, publicMetadata, SITE_URL } from "../lib/seo";
export const metadata = publicMetadata("GitHub & Docker Deployment Dashboard", "Deploy GitHub repositories with your own Docker workers. Manage team access, deployment logs, environments and AI failure diagnosis in DeployPilot.", "/");
const features = [
  ["01", "Import from GitHub", "Choose repositories, a Dockerfile, branch and environment."],
  ["02", "Connect your own worker", "Build and run containers on a computer your team controls."],
  ["03", "Track every deployment", "Follow stages and logs, manage team access, and retry, cancel or roll back."],
];
const questions = [
  ["Can I deploy any GitHub repository?", "Connect the GitHub App, load its permitted repositories and select one to import. Your application needs a supported Dockerfile, port and HTTP health check; some repositories need configuration changes first."],
  ["Where does my application run?", "It runs on your team's dedicated Docker worker. The dashboard is hosted on Vercel. Application addresses are local to the worker until your team provides public routing."],
  ["Can my team share deployment access?", "Yes. Owners and administrators manage access, developers deploy, and viewers read. Each team supplies its own worker and shares invitation links directly."],
  ["Does the AI assistant change my deployments?", "No. Groq chat offers guidance, and failure diagnosis suggests checks based on bounded redacted evidence. Both share limited free quotas and never execute fixes."],
];
export default function Home() {
  return <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 80% 10%,#202647 0,transparent 35%),var(--bg)" }}>
    <a className="dp-skip-link" href="#public-content">Skip to content</a>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "DeployPilot", url: `${SITE_URL}/` }, { "@type": "WebApplication", name: "DeployPilot", url: `${SITE_URL}/`, applicationCategory: "DeveloperApplication", operatingSystem: "Web", description: "A GitHub and Docker deployment dashboard for teams using their own workers.", browserRequirements: "GitHub account and a team-owned Docker worker" }] }) }} />
    <header style={{ display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "space-between", alignItems: "center", padding: "25px 6vw", borderBottom: "1px solid var(--line)" }}>
      <Link href="/" style={{ fontSize: 18, fontWeight: 800 }}><span style={{ color: "var(--green)", marginRight: 9 }}>✦</span>DeployPilot</Link>
      <nav aria-label="Main navigation" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}><Link className="dp-btn" href="/getting-started">Getting started</Link><Link className="dp-btn dp-btn-primary" href="/login">Sign in with GitHub</Link></nav>
    </header>
    <section id="public-content" style={{ padding: "80px 6vw 65px", maxWidth: 1150, margin: "auto" }}>
      <div className="dp-kicker" style={{ color: "var(--green)" }}>Public beta · Bring your own Docker worker</div>
      <h1 style={{ fontSize: "clamp(44px,7vw,82px)", lineHeight: 1.01, letterSpacing: "-.08em", maxWidth: 850, margin: "20px 0" }}>Deploy GitHub repositories<br /><span style={{ color: "var(--green)" }}>with your Docker workers.</span></h1>
      <p style={{ color: "var(--muted)", fontSize: 18, lineHeight: 1.7, maxWidth: 650 }}>A Docker deployment dashboard for self-hosted applications. Import GitHub repositories, connect your team's worker, and manage environments, deployment logs and AI troubleshooting in one place.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28 }}><Link className="dp-btn dp-btn-primary" href="/login">Get started with GitHub →</Link><Link className="dp-btn" href="/getting-started">How it works</Link></div>
      <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.7, maxWidth: 680, marginTop: 24 }}>Vercel hosts the dashboard. Your team supplies and keeps its worker online. Apps are local to that worker until your team configures public routing; managed cloud workers and automatic public app URLs are not included.</p>
    </section>
    <section aria-label="Deployment workflow" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 13, padding: "0 6vw 60px", maxWidth: 1250, margin: "auto" }}>
      {features.map(([number, title, description]) => <article className="dp-card" key={title} style={{ padding: 23 }}><div className="dp-mono" style={{ color: "var(--green)", fontSize: 12 }}>{number}</div><h2 style={{ fontSize: 18, margin: "18px 0 9px" }}>{title}</h2><p style={{ color: "var(--muted)", lineHeight: 1.6, margin: 0, fontSize: 13 }}>{description}</p></article>)}
    </section>
    <section aria-labelledby="faq-title" style={{ padding: "0 6vw 60px", maxWidth: 1150, margin: "auto" }}>
      <h2 id="faq-title" style={{ fontSize: 28, letterSpacing: "-.04em", marginBottom: 20 }}>Before your first deployment</h2>
      <div style={{ display: "grid", gap: 12 }}>{questions.map(([question, answer]) => <details className="dp-card" key={question} style={{ padding: 20 }}><summary style={{ cursor: "pointer", fontWeight: 700, lineHeight: 1.6 }}>{question}</summary><p style={{ color: "var(--muted)", lineHeight: 1.7, marginBottom: 0 }}>{answer}</p></details>)}</div>
      <p style={{ marginTop: 24 }}><Link className="dp-btn" href="/getting-started">Read the setup guide</Link></p>
    </section>
    <footer style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "24px 6vw", borderTop: "1px solid var(--line)", color: "var(--muted)", fontSize: 13 }}><span>DeployPilot · Public beta</span><Link href="/getting-started">Setup, data and operating limits</Link><a href="https://github.com/porwalakshat124/deploypilot#readme">Documentation</a><a href="https://github.com/porwalakshat124/deploypilot/issues">Feedback</a></footer>
  </main>;
}
