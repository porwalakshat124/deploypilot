"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiRequest } from "../../lib/api";

export type Repository = { id: string; fullName: string; defaultBranch: string; _count: { configs: number; environments: number }; workers: { id: string; lastSeenAt: string | null }[]; deployments: { id: string; status: string }[] };
type Context = { repositories: Repository[]; repoId: string; setRepoId: (id: string) => void; loading: boolean; error: string; refresh: () => Promise<void> };
const RepositoryContext = createContext<Context | null>(null);
export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repoId, setRepoId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{ repositories: Repository[] }>("/v1/repositories");
      setRepositories(data.repositories);
      const requested = new URLSearchParams(window.location.search).get("repositoryId");
      setRepoId(current => data.repositories.some(r => r.id === (requested || current)) ? (requested || current) : data.repositories[0]?.id || "");
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load repositories"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <RepositoryContext.Provider value={{ repositories, repoId, setRepoId, loading, error, refresh }}>{children}</RepositoryContext.Provider>;
}
export function useRepository() {
  const context = useContext(RepositoryContext);
  if (!context) throw new Error("Repository provider is missing");
  return context;
}
export function RepositoryPicker() {
  const { repositories, repoId, setRepoId, loading, error, refresh } = useRepository();
  return <div style={{ flex: 1, minWidth: 220 }}><label className="dp-label">Repository<select className="dp-select" value={repoId} onChange={e => setRepoId(e.target.value)} disabled={loading}><option value="">{loading ? "Loading repositories…" : "Choose a repository"}</option>{repositories.map(r => <option key={r.id} value={r.id}>{r.fullName}</option>)}</select></label>{error && <p role="alert">{error} <button className="dp-btn" onClick={() => void refresh()}>Retry</button></p>}{!loading && !error && !repositories.length && <p><Link href="/dashboard/repositories">Connect a GitHub repository to get started</Link></p>}</div>;
}
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [status, setStatus] = useState(label);
  return <button className="dp-btn" onClick={() => void navigator.clipboard.writeText(value).then(() => setStatus("Copied"), () => setStatus("Copy unavailable"))}>{status}</button>;
}
export function DeploymentPicker({ value, onChange, failedOnly = false }: { value: string; onChange: (id: string) => void; failedOnly?: boolean }) {
  const { repoId } = useRepository();
  const [runs, setRuns] = useState<{ id: string; commitSha: string; status: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setRuns([]); onChange("");
    if (repoId) void apiRequest<{ deployments: typeof runs }>("/v1/repositories/" + repoId + "/deployments" + (failedOnly ? "?status=FAILED" : "")).then(data => {
      if (active) { setRuns(data.deployments); onChange(data.deployments[0]?.id || ""); setError(""); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [repoId, failedOnly, onChange]);
  return <><RepositoryPicker /><label className="dp-label">Deployment<select className="dp-select" value={value} onChange={e => onChange(e.target.value)}><option value="">Choose a deployment</option>{runs.map(run => <option key={run.id} value={run.id}>{run.commitSha.slice(0, 12)} · {run.status} · {run.id.slice(0, 8)}</option>)}</select></label>{error && <p role="alert">{error}</p>}</>;
}
