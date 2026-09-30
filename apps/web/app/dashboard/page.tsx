"use client";
import Link from "next/link";
import { useApiResource } from "../../lib/use-api-resource";
import { useRepository } from "./repository-context";
import { Badge, Card, Empty, LoadingCards, PageHeader, Stat, formatDate } from "./ui";
import { Notice } from "./feedback";
type Run = { id: string; commitSha: string; status: string; createdAt: string; repository: { fullName: string }; environment: { name: string } | null };
export default function DashboardPage() {
  const { repositories, loading: repositoriesLoading } = useRepository();
  const { data, error, loading, reload } = useApiResource<{ deployments: Run[]; counts: { status: string; _count: number }[] }>("/v1/overview");
  const count = (status: string) => data ? data.counts.find(c => c.status === status)?._count ?? 0 : "—";
  const failed = data ? Number(count("FAILED")) + Number(count("TIMED_OUT")) : "—";
  return <><PageHeader eyebrow="Workspace / Overview" title="Deployment overview" description="Recent activity across your connected repositories." action={<Link className="dp-btn dp-btn-primary" href="/dashboard/deploy">New deployment</Link>} />
    {loading ? <LoadingCards label="Loading deployment overview" count={4} stats /> : <div className="dp-stats" style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14 }}><Stat label="Total deployments" value={data?.counts.reduce((n,c) => n+c._count,0) ?? "—"} /><Stat label="Successful" value={count("SUCCEEDED")} /><Stat label="Failed" value={failed} /><Stat label="Repositories" value={repositoriesLoading ? "…" : repositories.length} /></div>}
    <Notice message={error} retry={reload} />
    {data && <Card style={{ marginTop:20 }}><h2>Recent deployments</h2>{data.deployments.map(run => <Link key={run.id} href={"/dashboard/deployments/"+run.id} style={{ display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12,padding:"16px 0",borderBottom:"1px solid var(--line)" }}><span><strong>{run.repository.fullName}</strong><p>{run.commitSha.slice(0,12)} · {run.environment?.name} · {formatDate(run.createdAt)}</p></span><Badge status={run.status} /></Link>)}{!data.deployments.length && <Empty title="No deployments yet" text="Connect a repository, create its build profile, and register a remote worker." href="/dashboard/repositories" action="Connect repository" />}</Card>}
  </>;
}
