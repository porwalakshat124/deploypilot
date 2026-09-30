"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { RepositoryPicker, useRepository } from "../repository-context";
import { Badge, Card, Empty, PageHeader, formatDate } from "../ui";
type Run = { id: string; commitSha: string; status: string; trigger: string; createdAt: string; environment: { name: string } | null };
export default function DeploymentsPage() {
  const { repoId } = useRepository();
  const [runs, setRuns] = useState<Run[]>([]), [status, setStatus] = useState(""), [search, setSearch] = useState("");
  const [page, setPage] = useState(0), [total, setTotal] = useState(0), [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { setPage(0); }, [repoId, status, search]);
  useEffect(() => {
    let active = true; setRuns([]);
    if (!repoId) return;
    setLoading(true);
    const timer = setTimeout(() => void apiRequest<{ deployments: Run[]; total: number; hasMore: boolean }>("/v1/repositories/" + repoId + "/deployments?" + new URLSearchParams({ status, search, page: String(page) })).then(data => { if (active) { setRuns(data.deployments); setTotal(data.total); setHasMore(data.hasMore); setMessage(""); } }).catch(e => { if (active) setMessage(e.message); }).finally(() => { if (active) setLoading(false); }), 250);
    return () => { active = false; clearTimeout(timer); };
  }, [repoId, status, search, page]);
  return <><PageHeader eyebrow="Operations / History" title="Deployments" action={<Link className="dp-btn dp-btn-primary" href="/dashboard/deploy">New deployment</Link>} /><Card><RepositoryPicker /><div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}><label className="dp-label">Search commit or deployment ID<input className="dp-input" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="dp-label">Status<select className="dp-select" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"].map(s => <option key={s}>{s}</option>)}</select></label></div><p role="status">{loading ? "Loading deployments…" : message || total + " deployments"}</p></Card><div style={{ display: "grid", gap: 10, marginTop: 16 }}>{runs.map(run => <Card key={run.id}><Link href={"/dashboard/deployments/" + run.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}><div><strong className="dp-mono">{run.commitSha.slice(0, 12)}</strong><p>{run.environment?.name ?? "No environment"} · {run.trigger} · {formatDate(run.createdAt)}</p></div><Badge status={run.status} /></Link></Card>)}</div>{!loading && !runs.length && <Empty title="No matching deployments" text="Adjust the filters or create your first deployment." href="/dashboard/deploy" action="New deployment" />}<div style={{ display: "flex", gap: 10, marginTop: 16 }}><button className="dp-btn" disabled={!page || loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button className="dp-btn" disabled={!hasMore || loading} onClick={() => setPage(page + 1)}>Next</button></div></>;
}
