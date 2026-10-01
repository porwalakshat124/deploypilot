"use client";
import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useApiResource } from "../../../lib/use-api-resource";
import { RepositoryPicker, useRepository } from "../repository-context";
import { Notice, useFeedback } from "../feedback";
import { Card, Badge, Empty, LoadingCards, PageHeader, formatDate } from "../ui";
type Operations = {
  counts: { status: string; _count: number }[];
  active: { id: string; commitSha: string; status: string; approvalStatus: string; createdAt: string }[];
  effects: { id: string; deploymentId: string; kind: string; status: string; attempts: number; nextAttemptAt: string; lastError: string | null }[];
  canManage: boolean; transport: string; limits: string;
};
export default function QueuePage() {
  const { repoId } = useRepository();
  const resource = useApiResource<Operations>(repoId ? "/v1/repositories/" + repoId + "/operations" : null, { pollMs: 15000 });
  const feedback = useFeedback(); const [busy, setBusy] = useState("");
  const data = resource.data;
  return <><PageHeader eyebrow="Operations / Delivery" title="Queue & integrations" description="Inspect waiting builds and delivery retries for R2, Resend and GitHub." /><Card><RepositoryPicker /></Card><Notice message={resource.error || feedback.message} retry={resource.error ? resource.reload : undefined} />{resource.loading && <LoadingCards label="Loading operations" />}{data && <>
    <Card style={{marginTop:16}}><h2>{data.transport}</h2><p>{data.limits}</p><div style={{display:"flex",gap:16,flexWrap:"wrap"}}>{data.counts.map(count=><span key={count.status}><Badge status={count.status} /> {count._count}</span>)}</div></Card>
    <Card style={{marginTop:16}}><h2>Active runs</h2>{data.active.length ? data.active.map(run=><p key={run.id}><Link href={"/dashboard/deployments/"+run.id}>{run.commitSha.slice(0,12)}</Link> · <Badge status={run.status} /> · {run.approvalStatus === "PENDING" ? "Waiting for approval" : formatDate(run.createdAt)}</p>) : <Empty title="Queue is clear" text="No waiting or running builds for this repository." />}</Card>
    {data.canManage && <Card style={{marginTop:16}}><h2>Provider deliveries</h2><p>Failed deliveries stop after five automatic attempts. Retry after correcting the provider configuration.</p>{data.effects.length ? data.effects.map(effect=><div key={effect.id} style={{borderTop:"1px solid var(--line)",padding:"12px 0"}}><strong>{effect.kind}</strong> · <Badge status={effect.status} /> · {effect.attempts} attempts · <Link href={"/dashboard/deployments/"+effect.deploymentId}>Deployment</Link>{effect.lastError && <p>{effect.lastError}</p>}{effect.status === "PENDING" && <p>Next attempt: {formatDate(effect.nextAttemptAt)}</p>}{effect.status === "FAILED" && <button className="dp-btn" disabled={Boolean(busy)} onClick={async()=>{setBusy(effect.id);feedback.clear();try {await apiRequest("/v1/deliveries/"+effect.id+"/retry",{method:"POST"});feedback.success("Delivery retry queued.");resource.reload();}catch(error){feedback.fail(error,"Unable to retry");}finally{setBusy("");}}}>Retry delivery</button>}</div>) : <Empty title="No outstanding deliveries" text="Completed and skipped provider deliveries do not require attention." />}</Card>}
  </>}</>;
}
