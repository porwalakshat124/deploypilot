"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useApiResource } from "../../../lib/use-api-resource";
import { RepositoryPicker, useRepository, CopyButton } from "../repository-context";
import { Card, Empty, LoadingCards, PageHeader, Badge, formatDate } from "../ui";
import { Notice, useFeedback } from "../feedback";
type Worker = { id: string; name: string; version: string; lastSeenAt: string | null; revokedAt: string | null; capabilities: { maxConcurrency?: number; docker?: boolean } };
export default function WorkersPage() {
  const { repoId, loading: repositoriesLoading, error: repositoryError } = useRepository();
  const [name, setName] = useState("home-docker");
  const { data, error, loading, reload } = useApiResource<{ workers: Worker[] }>(repoId ? "/v1/repositories/" + repoId + "/workers" : null, { pollMs: 30000 });
  const workers = data?.workers ?? [];
  const [credential, setCredential] = useState<{ workerId: string; token: string } | null>(null);
  const feedback = useFeedback();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCredential(null); feedback.clear();
  }, [repoId]);
  async function action(kind: string, id?: string) {
    if ((kind === "revoke" || kind === "rotate-token") && !window.confirm(kind === "revoke" ? "Revoke this worker? Running jobs will stop when they next contact the API." : "Rotate the token? Restart this worker with the new token immediately.")) return;
    setBusy(true); feedback.clear();
    try {
      const result = await apiRequest<{ workerId: string; token: string }>(id ? "/v1/workers/" + id + "/" + kind : "/v1/repositories/" + repoId + "/workers/register", { method: "POST", body: JSON.stringify({ name, version: "0.2.0", maxConcurrency: 1 }) });
      if (result.token) setCredential(result); else setCredential(null);
      reload(); feedback.success(kind === "register" ? "Worker registered. Copy its token now." : "Worker updated.");
    } catch (e) { feedback.fail(e, "Worker action failed"); }
    finally { setBusy(false); }
  }
  const config = credential ? ["WORKER_API_URL=" + process.env.NEXT_PUBLIC_API_URL, "WORKER_ID=" + credential.workerId, "WORKER_TOKEN=" + credential.token].join("\n") : "";
  return <><PageHeader eyebrow="Runtime / Docker" title="Workers" description="Install the agent on a dedicated Docker host. It only needs outbound access to your API." />
    <Card><div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}><RepositoryPicker /><label className="dp-label">Worker name<input className="dp-input" value={name} onChange={e => setName(e.target.value)} /></label><button className="dp-btn dp-btn-primary" disabled={busy || !repoId || !name.trim()} onClick={() => action("register")}>{busy ? "Updating…" : "Register worker"}</button></div><Notice message={feedback.message} dismiss={feedback.clear} />
      {credential && <div><p>One-time credential for <code>{credential.workerId}</code>. Store it in the worker’s private environment file.</p><input className="dp-input" type="password" readOnly value={credential.token} /><CopyButton value={config} label="Copy worker environment" /><CopyButton value={credential.workerId} label="Copy worker ID" /><button className="dp-btn" onClick={() => setCredential(null)}>Hide credential</button></div>}
    </Card><Card style={{ marginTop: 16 }}><h2>Start the remote agent</h2><p>Windows/macOS: start Docker Desktop with Linux containers. Linux: start Docker Engine. Install Node.js 22 and pnpm 9.15, then copy this project to the machine.</p><pre className="dp-mono">pnpm install --frozen-lockfile{"\n"}pnpm --filter @deploypilot/worker start</pre><p>Set WORKER_API_URL, WORKER_ID and WORKER_TOKEN in the machine environment or private .env. Keep the Docker daemon private. Database, Redis and GitHub keys stay on the API server.</p><CopyButton value={"pnpm --filter @deploypilot/worker start"} label="Copy start command" /></Card>
    <Notice message={error} retry={reload} />{(loading || repositoriesLoading) && <LoadingCards label="Loading workers" />}
    <div style={{ display: "grid", gap: 12, marginTop: 16 }}>{workers.map(worker => <Card key={worker.id}><div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}><strong>{worker.name}</strong><Badge status={worker.revokedAt ? "REVOKED" : worker.lastSeenAt && Date.now() - Date.parse(worker.lastSeenAt) < 90000 ? "ONLINE" : "OFFLINE"} /></div><p>v{worker.version} · concurrency {worker.capabilities.maxConcurrency ?? 1} · Docker {worker.capabilities.docker ? "enabled" : "unavailable"}</p><p>Last heartbeat: {formatDate(worker.lastSeenAt)}</p><CopyButton value={worker.id} label="Copy ID" />{!worker.revokedAt && <><button className="dp-btn" disabled={busy} onClick={() => action("rotate-token", worker.id)}>Rotate token</button><button className="dp-btn dp-btn-danger" disabled={busy} onClick={() => action("revoke", worker.id)}>Revoke</button></>}</Card>)}</div>{!loading && !error && data && !workers.length && <Empty title="No workers available" text="Register a Docker worker above to run your deployments." />}{!repoId && !repositoriesLoading && !repositoryError && <Empty title="Choose a repository" text="Connect a repository before registering a worker." href="/dashboard/repositories" action="Connect repository" />}</>;
}
