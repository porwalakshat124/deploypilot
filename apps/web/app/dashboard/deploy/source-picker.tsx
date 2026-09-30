"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";

type BranchPage = { branches: { name: string; sha: string; protected: boolean }[]; nextPage: number | null };
type Discovery = { branch: string; commitSha: string; dockerfiles: { path: string; dockerContext: string }[]; truncated: boolean };

export function SourcePicker({ repoId, branch, onBranch, onDetect }: { repoId: string; branch: string; onBranch: (branch: string) => void; onDetect: (path: string, branch: string, automatic: boolean) => void }) {
  const [branches, setBranches] = useState<BranchPage["branches"]>([]);
  const [nextPage, setNextPage] = useState<number | null>(null), [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false), [branchError, setBranchError] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null), [scanning, setScanning] = useState(false), [scanError, setScanError] = useState("");
  const [refresh, setRefresh] = useState(0), [scanRefresh, setScanRefresh] = useState(0);
  useEffect(() => { setBranches([]); setPage(1); setNextPage(null); }, [repoId]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setBranchError("");
    void apiRequest<BranchPage>(`/v1/repositories/${repoId}/branches?page=${page}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setBranches(current => page === 1 ? data.branches : [...new Map([...current, ...data.branches].map(b => [b.name, b])).values()]);
      setNextPage(data.nextPage);
    }).catch(e => { if (!controller.signal.aborted) setBranchError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [repoId, page, refresh]);
  useEffect(() => {
    const controller = new AbortController(); setDiscovery(null); setScanError("");
    if (!branch) return () => controller.abort();
    setScanning(true);
    void apiRequest<Discovery>(`/v1/repositories/${repoId}/dockerfiles?branch=${encodeURIComponent(branch)}`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setDiscovery(data);
      const preferred = data.dockerfiles.find(file => file.path === "Dockerfile") ?? (data.dockerfiles.length === 1 ? data.dockerfiles[0] : undefined);
      if (preferred && !data.truncated) onDetect(preferred.path, branch, true);
    }).catch(e => { if (!controller.signal.aborted) setScanError(e.message); }).finally(() => { if (!controller.signal.aborted) setScanning(false); });
    return () => controller.abort();
  }, [repoId, branch, scanRefresh, onDetect]);
  return <div style={{ display: "grid", gap: 10 }}>
    <label className="dp-label">Branch<select className="dp-select" value={branch} onChange={e => onBranch(e.target.value)} disabled={loading && !branches.length}>
      <option value="">Choose a branch</option>
      {branch && !branches.some(b => b.name === branch) && <option value={branch}>{branch}</option>}
      {branches.map(b => <option key={b.name} value={b.name}>{b.name}{b.protected ? " (protected)" : ""}</option>)}
    </select></label>
    {loading && <p role="status">Loading GitHub branches…</p>}
    {branchError && <p role="alert">{branchError} <button className="dp-btn" onClick={() => setRefresh(n => n + 1)}>Retry branches</button></p>}
    {nextPage && !branchError && <button className="dp-btn" disabled={loading} onClick={() => setPage(nextPage)}>Load more branches</button>}
    <div><button className="dp-btn" disabled={scanning || !branch} onClick={() => setScanRefresh(n => n + 1)}>{scanning ? "Scanning Dockerfiles…" : "Rescan Dockerfiles"}</button></div>
    {scanError && <p role="alert">{scanError} You can enter a Dockerfile path manually in the profile editor.</p>}
    {discovery && <>
      <p role="status">{discovery.dockerfiles.length ? `${discovery.dockerfiles.length} Dockerfile${discovery.dockerfiles.length === 1 ? "" : "s"} found` : "No Dockerfiles found. Add one to this branch or enter a custom filename below."} · commit {discovery.commitSha.slice(0, 12)}</p>
      {discovery.truncated && <p role="alert">GitHub returned a partial file list. Some Dockerfiles may be missing; enter a path manually if needed.</p>}
      {discovery.dockerfiles.length > 0 && <label className="dp-label">Use a detected Dockerfile<select className="dp-select" value="" onChange={e => { if (e.target.value) onDetect(e.target.value, branch, false); }}><option value="">Choose a file for the profile editor</option>{discovery.dockerfiles.map(file => <option key={file.path} value={file.path}>{file.path}</option>)}</select></label>}
      <p>Detection fills new profiles with the root Dockerfile, or the only file found. Saved profiles and your edits stay unchanged. Review the build context: COPY paths are relative to that context, which defaults to the repository root.</p>
    </>}
  </div>;
}
