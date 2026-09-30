"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApiResource } from "../../../lib/use-api-resource";
import { RepositoryPicker, useRepository } from "../repository-context";
import { Badge, Card, Empty, LoadingCards, PageHeader, formatDate } from "../ui";
import { Notice } from "../feedback";
type Run = { id: string; commitSha: string; status: string; trigger: string; createdAt: string; environment: { name: string } | null };
export default function DeploymentsPage() {
  const { repoId, loading: repositoriesLoading, error: repositoryError } = useRepository();
  const [status, setStatus] = useState(""), [search, setSearch] = useState(""), [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [repoId,status,search]);
  const { data, error, loading, reload } = useApiResource<{ deployments: Run[]; total: number; hasMore: boolean }>(repoId ? "/v1/repositories/"+repoId+"/deployments?"+new URLSearchParams({status,search,page:String(page)}) : null, { delayMs:250 });
  const filtered = Boolean(status || search);
  return <><PageHeader eyebrow="Operations / History" title="Deployments" action={<Link className="dp-btn dp-btn-primary" href="/dashboard/deploy">New deployment</Link>} /><Card><RepositoryPicker /><div style={{ display:"flex",gap:12,marginTop:12,flexWrap:"wrap" }}><label className="dp-label">Search commit or deployment ID<input className="dp-input" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="dp-label">Status<select className="dp-select" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{["QUEUED","RUNNING","SUCCEEDED","FAILED","CANCELLED","TIMED_OUT"].map(s => <option key={s}>{s}</option>)}</select></label>{filtered && <button className="dp-btn" onClick={() => { setSearch(""); setStatus(""); setPage(0); }}>Clear filters</button>}</div>{data && <p>{data.total} deployments</p>}</Card>
    <Notice message={error} retry={reload} />
    {(loading || repositoriesLoading) && <LoadingCards label="Loading deployments" />}
    <div style={{ display:"grid",gap:10,marginTop:16 }}>{data?.deployments.map(run => <Card key={run.id}><Link href={"/dashboard/deployments/"+run.id} style={{ display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:14 }}><div><strong className="dp-mono">{run.commitSha.slice(0,12)}</strong><p>{run.environment?.name ?? "No environment"} · {run.trigger} · {formatDate(run.createdAt)}</p></div><Badge status={run.status} /></Link></Card>)}</div>
    {!loading && !error && data && !data.deployments.length && <Empty title={filtered ? "No matching deployments" : "No deployments yet"} text={filtered ? "Try another commit or status, or clear your filters above." : "Your deployment history will appear here after the first run."} href={filtered ? undefined : "/dashboard/deploy"} action="New deployment" />}
    {!repoId && !repositoriesLoading && !repositoryError && <Empty title="Choose a repository" text="Connect a repository to view its deployment history." href="/dashboard/repositories" action="Connect repository" />}
    {data && data.total > 0 && <div style={{ display:"flex",gap:10,marginTop:16,alignItems:"center" }}><button className="dp-btn" disabled={!page || loading} onClick={() => setPage(n => n-1)}>Previous</button><span>Page {page+1}</span><button className="dp-btn" disabled={!data.hasMore || loading} onClick={() => setPage(n => n+1)}>Next</button></div>}
  </>;
}
