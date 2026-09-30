"use client";
import { useState } from "react";
import Link from "next/link";
import { apiRequest } from "../../../lib/api";
import { useRepository } from "../repository-context";
import { Card, PageHeader, Badge, Empty } from "../ui";
export default function RepositoriesPage() {
  const { repositories, loading, error, refresh, setRepoId } = useRepository();
  const [installationId, setInstallationId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function sync() {
    setBusy(true);
    try { await apiRequest("/v1/github/installations/" + encodeURIComponent(installationId.trim()) + "/repositories"); await refresh(); setMessage("Repositories synchronized."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to sync"); }
    finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Setup / Source control" title="Repositories" description="Connected GitHub sources, configuration readiness, and latest deployments." />
    <Card><label className="dp-label">GitHub App installation ID<input className="dp-input" value={installationId} onChange={e => setInstallationId(e.target.value)} /></label><button className="dp-btn dp-btn-primary" disabled={busy || !installationId.trim()} onClick={sync}>{busy ? "Synchronizing…" : "Sync repositories"}</button><p role="status">{message || error}</p></Card>
    {loading && <Card>Loading repositories…</Card>}
    <div style={{ display: "grid", gap: 14, marginTop: 18 }}>{repositories.map(repo => {
      const online = repo.workers.some(w => w.lastSeenAt && Date.now() - Date.parse(w.lastSeenAt) < 90000);
      const ready = repo._count.configs > 0 && repo._count.environments > 0 && online;
      return <Card key={repo.id}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><h2>{repo.fullName}</h2><Badge status={ready ? "READY" : "SETUP REQUIRED"} /></div><p>Default branch: <code>{repo.defaultBranch}</code></p><p>Profiles: {repo._count.configs} · Environments: {repo._count.environments} · Worker: {online ? "online" : "offline"}</p><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><a className="dp-btn" href={"https://github.com/" + repo.fullName} target="_blank" rel="noreferrer">View on GitHub</a><Link className="dp-btn dp-btn-primary" onClick={() => setRepoId(repo.id)} href={"/dashboard/deploy?repositoryId=" + repo.id}>Configure and deploy</Link>{repo.deployments[0] && <Link className="dp-btn" href={"/dashboard/deployments/" + repo.deployments[0].id}>Latest: {repo.deployments[0].status}</Link>}</div></Card>;
    })}</div>{!loading && !repositories.length && <Empty title="No repositories connected" text="Install the GitHub App on your personal account and synchronize its installation above." />}</>;
}
