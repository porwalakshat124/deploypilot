"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useApiResource } from "../../../lib/use-api-resource";
import { RepositoryPicker, useRepository } from "../repository-context";
import { Card, Empty, LoadingCards, PageHeader } from "../ui";
import { Notice, useFeedback } from "../feedback";
type Environment = { id: string; name: string; url: string | null };
export default function EnvironmentsPage() {
  const { repoId, loading: repositoriesLoading, error: repositoryError } = useRepository();
  const [name,setName] = useState("Production"), [url,setUrl] = useState(""), [editId,setEditId] = useState(""), [busy,setBusy] = useState(false);
  const feedback = useFeedback();
  const { data,error,loading,reload } = useApiResource<{ environments: Environment[] }>(repoId ? "/v1/repositories/"+repoId+"/setup" : null);
  const path = "/v1/repositories/"+repoId+"/environments";
  useEffect(() => { setEditId(""); setName("Production"); setUrl(""); feedback.clear(); }, [repoId]);
  async function save() {
    setBusy(true); feedback.clear();
    try { await apiRequest(path+(editId ? "/"+editId : ""),{ method:editId ? "PATCH" : "POST",body:JSON.stringify({name,url}) }); setEditId(""); setName(""); setUrl(""); reload(); feedback.success("Environment saved."); }
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
  return <><PageHeader eyebrow="Runtime / Targets" title="Environments" description="Configure deployment destinations. Production and environments with deployment history are protected from deletion." /><Card><RepositoryPicker /><div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:12}}><label className="dp-label">Name<input className="dp-input" value={name} onChange={e=>setName(e.target.value)} /></label><label className="dp-label">Public URL<input className="dp-input" type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://app.example.com" /></label></div><div style={{display:"flex",gap:10,marginTop:14}}><button className="dp-btn dp-btn-primary" disabled={busy || !repoId || !name.trim()} onClick={save}>{busy ? "Saving…" : editId ? "Save changes" : "Create environment"}</button>{editId && <button className="dp-btn" disabled={busy} onClick={()=>{setEditId("");setName("");setUrl("");feedback.clear();}}>Cancel edit</button>}</div><Notice message={feedback.message} dismiss={feedback.clear} /></Card>
    <Notice message={error} retry={reload} />
    {(loading || repositoriesLoading) && <LoadingCards label="Loading environments" />}
    <div style={{display:"grid",gap:12,marginTop:18}}>{data?.environments.map(item=><Card key={item.id}><h2>{item.name}</h2><p>{item.url && /^https?:\/\//.test(item.url) ? <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a> : "No public URL configured"}</p><p>Health is reported by each deployment’s worker check.</p><div style={{display:"flex",gap:10}}><button className="dp-btn" disabled={busy} onClick={()=>{setEditId(item.id);setName(item.name);setUrl(item.url ?? "");feedback.clear();}}>Edit</button>{item.name.toLowerCase()!=="production" && <button className="dp-btn dp-btn-danger" disabled={busy} onClick={()=>remove(item.id)}>Delete</button>}</div></Card>)}</div>
    {!loading && !error && data && !data.environments.length && <Empty title="No environments yet" text="Create a destination above, then select it when deploying." />}
    {!repoId && !repositoriesLoading && !repositoryError && <Empty title="Choose a repository" text="Connect a repository before configuring its environments." href="/dashboard/repositories" action="Connect repository" />}
  </>;
}
