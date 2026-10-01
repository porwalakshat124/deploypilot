"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "../../../../lib/api";
import { useApiResource } from "../../../../lib/use-api-resource";
import { Badge, Card, formatDate } from "../../ui";
import { Notice, useFeedback } from "../../feedback";
type Runtime = { id: string; state: string; endpoint: string | null; imageId: string | null; observedAt: string | null; desiredState: string; commands: { id: string; action: string; status: string }[] };
export function RuntimePanel({ deploymentId, status }: { deploymentId: string; status: string }) {
  const runtime = useApiResource<{ repositoryId: string; canControl: boolean; releaseKind: string; runtime: Runtime | null }>("/v1/deployments/"+deploymentId+"/runtime", { pollMs: 15000 });
  const setup = useApiResource<{ environments: { id: string; name: string }[]; workers: { id: string; name: string; revokedAt: string | null }[] }>(runtime.data?.canControl ? "/v1/repositories/"+runtime.data.repositoryId+"/setup" : null);
  const [environmentId,setEnvironment] = useState(""), [workerId,setWorker] = useState(""), [busy,setBusy] = useState(false);
  const feedback = useFeedback(), router = useRouter();
  const data = runtime.data?.runtime, pending = data?.commands.some(c=>["PENDING","RUNNING"].includes(c.status));
  async function action(name: string) {
    setBusy(true);feedback.clear();
    try {
      const result = await apiRequest<{ id?: string }>("/v1/deployments/"+deploymentId+"/"+name,{method:"POST",body:JSON.stringify({environmentId,workerId})});
      if (result.id) router.push("/dashboard/deployments/"+result.id);
      else { runtime.reload(); feedback.success("Runtime command queued."); }
    } catch(e) { feedback.fail(e,"Unable to update runtime"); } finally {setBusy(false);}
  }
  return <Card style={{marginTop:16}}><h2>Runtime & releases</h2><Notice message={feedback.message || runtime.error} retry={runtime.error ? runtime.reload : undefined} />
    {data ? <><Badge status={data.state} /><p>Observed {formatDate(data.observedAt)} · Requested state: {data.desiredState}</p>{data.observedAt && Date.now()-Date.parse(data.observedAt)>60000 && <p role="status">Observation is stale. Check the worker before relying on this health state.</p>}<p>Worker-local address: <code>{data.endpoint || "Unavailable"}</code>. Open this address on the worker computer.</p><p>Image: <code>{data.imageId?.slice(0,24) || "Not recorded"}</code></p>{runtime.data?.canControl && <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{["start","stop","restart"].map(a=><button className="dp-btn" key={a} disabled={busy || pending} onClick={()=>void action("runtime/"+a)}>{a[0].toUpperCase()+a.slice(1)} runtime</button>)}</div>}{data.commands.map(c=><p key={c.id}>{c.action} · {c.status}</p>)}</> : <p>No managed runtime recorded. Deploy with a version 1.2 worker to enable controls and immutable image rollback.</p>}
    {status === "SUCCEEDED" && runtime.data?.canControl && <><h3>Promote this commit</h3><p>Build the same commit and profile for another environment using its secrets and approval policy. Each release starts a separate container.</p><Notice message={setup.error} retry={setup.reload} /><label className="dp-label">Target environment<select className="dp-select" value={environmentId} onChange={e=>setEnvironment(e.target.value)}><option value="">Choose environment</option>{setup.data?.environments.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label className="dp-label">Target worker<select className="dp-select" value={workerId} onChange={e=>setWorker(e.target.value)}><option value="">Choose worker</option>{setup.data?.workers.filter(w=>!w.revokedAt).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><button className="dp-btn" disabled={busy || !environmentId || !workerId} onClick={()=>void action("promote")}>Promote commit</button>{data?.imageId && <><h3>Rollback to this image</h3><p>Start this recorded immutable image on its original worker and environment. The image must still exist on that worker. Existing containers keep running until you stop them.</p><button className="dp-btn" disabled={busy} onClick={()=>void action("rollback")}>Deploy recorded image</button></>}</>}
  </Card>;
}
