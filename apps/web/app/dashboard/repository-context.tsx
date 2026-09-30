"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiRequest } from "../../lib/api";
import { useApiResource } from "../../lib/use-api-resource";
import { Notice, useToast } from "./feedback";
import { Empty } from "./ui";

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
  return <div style={{ flex: 1, minWidth: 220 }}><label className="dp-label">Repository<select className="dp-select" value={repoId} onChange={e => setRepoId(e.target.value)} disabled={loading}><option value="">{loading ? "Loading repositories…" : "Choose a repository"}</option>{repositories.map(r => <option key={r.id} value={r.id}>{r.fullName}</option>)}</select></label><Notice message={error} retry={() => void refresh()} />{!loading && !error && !repositories.length && <p><Link href="/dashboard/repositories">Connect a GitHub repository to get started</Link></p>}</div>;
}
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const notify = useToast();
  return <button className="dp-btn" onClick={async () => { try { await navigator.clipboard.writeText(value); notify("Copied to clipboard."); } catch { notify("Clipboard access is unavailable. Select and copy the value manually.", "error"); } }}>{label}</button>;
}
export function DeploymentPicker({ value, onChange, failedOnly = false }: { value: string; onChange: (id: string) => void; failedOnly?: boolean }) {
  const { repoId } = useRepository();
  const { data, error, loading, reload } = useApiResource<{ deployments: { id: string; commitSha: string; status: string }[] }>(repoId ? "/v1/repositories/" + repoId + "/deployments" + (failedOnly ? "?status=FAILED" : "") : null);
  const runs = data?.deployments ?? [];
  useEffect(() => {
    onChange(data?.deployments[0]?.id ?? "");
  }, [data, onChange]);
  return <><RepositoryPicker /><label className="dp-label">Deployment<select className="dp-select" value={value} disabled={loading || !runs.length} onChange={e => onChange(e.target.value)}><option value="">{loading ? "Loading deployments…" : "Choose a deployment"}</option>{runs.map(run => <option key={run.id} value={run.id}>{run.commitSha.slice(0, 12)} · {run.status} · {run.id.slice(0, 8)}</option>)}</select></label><Notice message={error} retry={reload} />{!loading && !error && data && !runs.length && <Empty title={failedOnly ? "No failed deployments" : "No deployments yet"} text={failedOnly ? "A failed run will appear here when diagnosis is available." : "Create your first deployment to inspect its logs."} href="/dashboard/deploy" action="New deployment" />}</>;
}
