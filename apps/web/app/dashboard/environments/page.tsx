"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { RepositoryPicker, useRepository } from "../repository-context";
import { Card, Empty, PageHeader } from "../ui";
type Environment = { id: string; name: string; url: string | null };
export default function EnvironmentsPage() {
  const { repoId } = useRepository();
  const [items, setItems] = useState<Environment[]>([]), [name, setName] = useState("Production"), [url, setUrl] = useState(""), [editId, setEditId] = useState("");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const path = "/v1/repositories/" + repoId + "/environments";
  async function load() { const data = await apiRequest<{ environments: Environment[] }>("/v1/repositories/" + repoId + "/setup"); setItems(data.environments); }
  useEffect(() => {
    let active = true; setItems([]); setEditId(""); setName("Production"); setUrl("");
    if (repoId) void apiRequest<{ environments: Environment[] }>("/v1/repositories/" + repoId + "/setup").then(data => { if (active) setItems(data.environments); }).catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [repoId]);
  async function save() {
    setBusy(true);
    try { await apiRequest(path + (editId ? "/" + editId : ""), { method: editId ? "PATCH" : "POST", body: JSON.stringify({ name, url }) }); await load(); setEditId(""); setMessage("Environment saved."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save environment"); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this unused environment?")) return;
    try { await apiRequest(path + "/" + id, { method: "DELETE" }); await load(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to delete environment"); }
  }
  return <><PageHeader eyebrow="Runtime / Targets" title="Environments" description="Configure deployment destinations. Production and environments with deployment history are protected from deletion." /><Card><RepositoryPicker /><div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}><label className="dp-label">Name<input className="dp-input" value={name} onChange={e => setName(e.target.value)} /></label><label className="dp-label">Public URL<input className="dp-input" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://app.example.com" /></label></div><button className="dp-btn dp-btn-primary" disabled={busy || !repoId || !name.trim()} onClick={save}>{editId ? "Save changes" : "Create environment"}</button>{editId && <button className="dp-btn" onClick={() => { setEditId(""); setName(""); setUrl(""); }}>Cancel edit</button>}<p role="status">{message}</p></Card>
    <div style={{ display: "grid", gap: 12, marginTop: 18 }}>{items.map(item => <Card key={item.id}><h2>{item.name}</h2><p>{item.url && /^https?:\/\//.test(item.url) ? <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a> : "No public URL configured"}</p><p>Health is reported by each deployment’s worker check.</p><button className="dp-btn" onClick={() => { setEditId(item.id); setName(item.name); setUrl(item.url ?? ""); }}>Edit</button>{item.name.toLowerCase() !== "production" && <button className="dp-btn dp-btn-danger" onClick={() => remove(item.id)}>Delete</button>}</Card>)}</div>{!items.length && <Empty title="No environments" text="Create a destination above, then select it when deploying." />}</>;
}
