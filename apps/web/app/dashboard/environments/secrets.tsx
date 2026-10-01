"use client";
import { useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useApiResource } from "../../../lib/use-api-resource";
import { Notice, useFeedback } from "../feedback";
export function EnvironmentSecrets({ repoId, environmentId }: { repoId: string; environmentId: string }) {
  const path = "/v1/environments/" + environmentId + "/secrets";
  const resource = useApiResource<{ configured: boolean; secrets: { name: string }[] }>(path);
  const [name,setName] = useState(""), [value,setValue] = useState(""), [busy,setBusy] = useState(false), [remove,setRemove] = useState("");
  const feedback = useFeedback();
  async function save() {
    setBusy(true); feedback.clear();
    try { await apiRequest(path, { method: "POST", body: JSON.stringify({ name, value }) }); setValue(""); setName(""); resource.reload(); feedback.success("Secret encrypted and saved. Future deployments use this value."); }
    catch(e) { feedback.fail(e,"Unable to save secret"); }
    finally { setBusy(false); }
  }
  return <details><summary>Runtime secrets</summary><p>Administrators can replace values. Values are never displayed. Add required names to the build profile; secrets are injected after the image is built. Application output is suppressed for runs using secrets.</p><Notice message={feedback.message || resource.error} retry={resource.error ? resource.reload : undefined} />
    {resource.data && <>{!resource.data.configured && <p>API encryption key is not configured.</p>}<form onSubmit={e=>{e.preventDefault();void save();}}><label className="dp-label">Secret name<input className="dp-input" required pattern="[A-Za-z_][A-Za-z0-9_]*" maxLength={100} value={name} onChange={e=>setName(e.target.value)} /></label><label className="dp-label">New value<input type="password" autoComplete="new-password" className="dp-input" required minLength={8} maxLength={16000} value={value} onChange={e=>setValue(e.target.value)} /></label><button className="dp-btn" disabled={busy || !resource.data.configured}>Save secret</button></form>{resource.data.secrets.map(secret=><p key={secret.name}><code>{secret.name}</code> {remove === secret.name ? <><button className="dp-btn dp-btn-danger" disabled={busy} onClick={async()=>{setBusy(true);try{await apiRequest(path+"/"+encodeURIComponent(secret.name),{method:"DELETE"});resource.reload();setRemove("");feedback.success("Secret removed from future deployments.");}catch(e){feedback.fail(e,"Unable to remove secret");}finally{setBusy(false);}}}>Confirm removal</button><button className="dp-btn" onClick={()=>setRemove("")}>Keep secret</button></> : <button className="dp-btn" disabled={busy} onClick={()=>setRemove(secret.name)}>Remove</button>}</p>)}</>}
  </details>;
}
