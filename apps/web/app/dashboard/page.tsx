"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useRepository } from "./repository-context";
import { Badge, Card, Empty, PageHeader, Stat, formatDate } from "./ui";
type Run = { id: string; commitSha: string; status: string; createdAt: string; repository: { fullName: string }; environment: { name: string } | null };
export default function DashboardPage() {
  const { repositories } = useRepository();
  const [data, setData] = useState<{ deployments: Run[]; counts: { status: string; _count: number }[] } | null>(null), [error, setError] = useState("");
  useEffect(() => { void apiRequest<NonNullable<typeof data>>("/v1/overview").then(setData).catch(e => setError(e.message)); }, []);
  const count = (status: string) => data?.counts.find(c => c.status === status)?._count ?? 0;
  return <><PageHeader eyebrow="Workspace / Overview" title="Deployment overview" description="Recent activity across your connected repositories." action={<Link className="dp-btn dp-btn-primary" href="/dashboard/deploy">New deployment</Link>} /><div className="dp-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}><Stat label="Total deployments" value={data?.counts.reduce((n, c) => n + c._count, 0) ?? "…"} /><Stat label="Successful" value={count("SUCCEEDED")} /><Stat label="Failed" value={count("FAILED") + count("TIMED_OUT")} /><Stat label="Repositories" value={repositories.length} /></div>{error && <p role="alert">{error}</p>}<Card style={{ marginTop: 20 }}><h2>Recent deployments</h2>{data?.deployments.map(run => <Link key={run.id} href={"/dashboard/deployments/" + run.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "16px 0", borderBottom: "1px solid var(--line)" }}><span><strong>{run.repository.fullName}</strong><p>{run.commitSha.slice(0, 12)} · {run.environment?.name} · {formatDate(run.createdAt)}</p></span><Badge status={run.status} /></Link>)}{data && !data.deployments.length && <Empty title="No deployments yet" text="Connect a repository, create its build profile, and register a remote worker." href="/dashboard/repositories" action="Connect repository" />}{!data && !error && <p>Loading activity…</p>}</Card></>;
}
