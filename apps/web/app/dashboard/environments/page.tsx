"use client";
import { EnvironmentSecrets } from "./secrets";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useApiResource } from "../../../lib/use-api-resource";
import { RepositoryPicker, useRepository } from "../repository-context";
import { Card, Empty, LoadingCards, PageHeader } from "../ui";
import { Notice, useFeedback } from "../feedback";
type Policy = { allowedBranches?: string[]; allowedWorkers?: string[]; requiresApproval?: boolean };
type Environment = { id: string; name: string; url: string | null; policy: Policy };
export default function EnvironmentsPage() {
  const { repoId, loading: repositoriesLoading, error: repositoryError } = useRepository();
  const [name,setName] = useState("Production"), [url,setUrl] = useState(""), [editId,setEditId] = useState(""), [busy,setBusy] = useState(false);
  const [branches, setBranches] = useState(""), [workers, setWorkers] = useState<string[]>([]), [approval, setApproval] = useState(false);
  const resetPolicy = () => { setBranches(""); setWorkers([]); setApproval(false); };
  const feedback = useFeedback();
  const { data,error,loading,reload } = useApiResource<{ environments: Environment[]; workers: { id: string; name: string; revokedAt: string | null }[] }>(repoId ? "/v1/repositories/"+repoId+"/setup" : null);
  const path = "/v1/repositories/"+repoId+"/environments";
  useEffect(() => { setEditId(""); setName("Production"); setUrl(""); resetPolicy(); feedback.clear(); }, [repoId]);
  async function save() {
    setBusy(true); feedback.clear();
    try { await apiRequest(path+(editId ? "/"+editId : ""),{ method:editId ? "PATCH" : "POST",body:JSON.stringify({name,url,policy:{allowedBranches:branches.split(",").map(v=>v.trim()).filter(Boolean),allowedWorkers:workers,requiresApproval:approval}}) }); setEditId(""); setName(""); setUrl(""); resetPolicy(); reload(); feedback.success("Environment saved."); }
    catch(e) { feedback.fail(e,"Unable to save environment"); }
    finally { setBusy(false); }
  }
  async function remove(id:string) {
    if (!window.confirm("Delete this unused environment?")) return;
    setBusy(true); feedback.clear();
    try { await apiRequest(path+"/"+id,{method:"DELETE"}); reload(); feedback.success("Environment deleted."); }
    catch(e) { feedback.fail(e,"Unable to delete environment"); }
    finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Runtime / Targets" title="Environments" description="Configure deployment destinations. Production and environments with deployment history are protected from deletion." /><Card><RepositoryPicker /><div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:12}}><label className="dp-label">Name<input className="dp-input" value={name} onChange={e=>setName(e.target.value)} /></label><label className="dp-label">Public URL<input className="dp-input" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://app.example.com" /></label></div><label className="dp-label" style={{marginTop:12}}>Allowed branches (comma separated; empty allows all)<input className="dp-input" value={branches} onChange={e=>setBranches(e.target.value)} placeholder="main, release" /></label><label className="dp-label">Allowed workers (none selected allows all)<select className="dp-select" multiple value={workers} onChange={e=>setWorkers(Array.from(e.target.selectedOptions, option=>option.value))}>{data?.workers.filter(worker=>!worker.revokedAt).map(worker=><option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label><label style={{display:"block",marginTop:12}}><input type="checkbox" checked={approval} onChange={e=>setApproval(e.target.checked)} /> Require approval from a different team administrator</label><div style={{display:"flex",gap:10,marginTop:14}}><button className="dp-btn dp-btn-primary" disabled={busy || !repoId || !name.trim()} onClick={save}>{busy ? "Saving…" : editId ? "Save changes" : "Create environment"}</button>{editId && <button className="dp-btn" disabled={busy} onClick={()=>{setEditId("");setName("");setUrl("");resetPolicy();feedback.clear();}}>Cancel edit</button>}</div><Notice message={feedback.message} dismiss={feedback.clear} /></Card>
    <Notice message={error} retry={reload} />
    {(loading || repositoriesLoading) && <LoadingCards label="Loading environments" />}
    <div style={{display:"grid",gap:12,marginTop:18}}>{data?.environments.map(item=><Card key={item.id}><h2>{item.name}</h2><p>{item.url && /^https?:\/\//.test(item.url) ? <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a> : "No public URL configured"}</p><p>{item.policy.requiresApproval ? "Approval required" : "Automatic execution"} · Branches: {item.policy.allowedBranches?.join(", ") || "all"} · Workers: {item.policy.allowedWorkers?.length || "all"}</p><p>Health is reported by each deployment’s worker check.</p><div style={{display:"flex",gap:10}}><button className="dp-btn" disabled={busy} onClick={()=>{setEditId(item.id);setName(item.name);setUrl(item.url ?? "");setBranches(item.policy.allowedBranches?.join(", ") || "");setWorkers(item.policy.allowedWorkers ?? []);setApproval(item.policy.requiresApproval === true);feedback.clear();}}>Edit</button>{item.name.toLowerCase()!=="production" && <button className="dp-btn dp-btn-danger" disabled={busy} onClick={()=>remove(item.id)}>Delete</button>}</div><EnvironmentSecrets repoId={repoId} environmentId={item.id} /></Card>)}</div>
    {!loading && !error && data && !data.environments.length && <Empty title="No environments yet" text="Create a destination above, then select it when deploying." />}
    {!repoId && !repositoriesLoading && !repositoryError && <Empty title="Choose a repository" text="Connect a repository before configuring its environments." href="/dashboard/repositories" action="Connect repository" />}
  </>;
}
