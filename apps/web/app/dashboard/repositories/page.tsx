"use client";
import { useState } from "react";
import Link from "next/link";
import { useApiResource } from "../../../lib/use-api-resource";
import { apiRequest, githubProviderToken, authorizeOrganizations } from "../../../lib/api";
import { useRepository } from "../repository-context";
import { Card, PageHeader, Badge, Empty, LoadingCards } from "../ui";
import { Notice, useFeedback } from "../feedback";
export default function RepositoriesPage() {
  const { repositories, loading, error, refresh, setRepoId } = useRepository();
  const [installationId, setInstallationId] = useState("");
  const feedback = useFeedback();
  const teams = useApiResource<{teams:{id:string;name:string;archivedAt:string|null;members:{role:string}[]}[]}>("/v1/teams");
  const archived = useApiResource<{repositories:{id:string;fullName:string}[]}>("/v1/repositories/archived");
  const [teamId,setTeam] = useState(""), [disconnect,setDisconnect] = useState(""), [confirmation,setConfirmation] = useState("");
  async function change(path:string,body={},method="POST") {setBusy(true);feedback.clear();try{await apiRequest(path,{method,body:JSON.stringify(body)});await refresh();archived.reload();setDisconnect("");setConfirmation("");feedback.success("Repository updated.");}catch(e){feedback.fail(e,"Unable to update repository");}finally{setBusy(false);}}
  const [busy, setBusy] = useState(false);
  async function sync() {
    setBusy(true); feedback.clear();
    try { await apiRequest("/v1/github/installations/" + encodeURIComponent(installationId.trim()) + "/repositories" + (teamId ? "?teamId="+encodeURIComponent(teamId) : ""),teamId ? {headers:{"X-GitHub-Token":await githubProviderToken()}} : undefined); await refresh(); feedback.success("Repositories synchronized."); }
    catch (e) { feedback.fail(e, "Unable to sync repositories"); }
    finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Setup / Source control" title="Repositories" description="Connected GitHub sources, configuration readiness, and latest deployments." />
    <Card><label className="dp-label">GitHub App installation ID<input className="dp-input" value={installationId} onChange={e => setInstallationId(e.target.value)} /></label><label className="dp-label">Organization team (personal installation: leave empty)<select className="dp-select" value={teamId} onChange={e=>setTeam(e.target.value)}><option value="">Personal GitHub account</option>{teams.data?.teams.filter(t=>!t.archivedAt && ["OWNER","ADMIN"].includes(t.members[0]?.role)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{teamId && <p>Connecting requires ownership of the GitHub organization and administrator access to this team. <button className="dp-btn" disabled={busy} onClick={()=>void authorizeOrganizations().catch(e=>feedback.fail(e,"Unable to authorize GitHub"))}>Authorize organization access</button></p>}<button className="dp-btn dp-btn-primary" disabled={busy || !installationId.trim()} onClick={sync}>{busy ? "Synchronizing…" : "Sync repositories"}</button><Notice message={feedback.message} dismiss={feedback.clear} /></Card>
    <Notice message={error} retry={() => void refresh()} />{loading && <LoadingCards label="Loading repositories" />}
    <div style={{ display: "grid", gap: 14, marginTop: 18 }}>{repositories.map(repo => {
      const online = repo.workers.some(w => w.lastSeenAt && Date.now() - Date.parse(w.lastSeenAt) < 90000);
      const ready = repo._count.configs > 0 && repo._count.environments > 0 && online;
      return <Card key={repo.id}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><h2>{repo.fullName}</h2><Badge status={ready ? "READY" : "SETUP REQUIRED"} /></div><p>Default branch: <code>{repo.defaultBranch}</code></p><p>Profiles: {repo._count.configs} · Environments: {repo._count.environments} · Worker: {online ? "online" : "offline"}</p><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><a className="dp-btn" href={"https://github.com/" + repo.fullName} target="_blank" rel="noreferrer">View on GitHub</a><Link className="dp-btn dp-btn-primary" onClick={() => setRepoId(repo.id)} href={"/dashboard/deploy?repositoryId=" + repo.id}>Configure and deploy</Link>{repo.deployments[0] && <Link className="dp-btn" href={"/dashboard/deployments/" + repo.deployments[0].id}>Latest: {repo.deployments[0].status}</Link>}</div><label style={{display:"block",marginTop:12}}><input type="checkbox" checked={repo.previewEnabled} disabled={busy} onChange={e=>void change("/v1/repositories/"+repo.id+"/previews",{enabled:e.target.checked},"PATCH")} /> Enable pull request previews</label><p>Previews use a matching branch profile or *. Forks and profiles requiring secrets are excluded. A version 1.2 worker and the GitHub App pull_request event subscription are required. Preview addresses are local to the worker.</p>{disconnect===repo.id ? <><label className="dp-label">Type {repo.fullName} to disconnect<input className="dp-input" value={confirmation} onChange={e=>setConfirmation(e.target.value)} /></label><button className="dp-btn dp-btn-danger" disabled={busy || confirmation!==repo.fullName} onClick={()=>void change("/v1/repositories/"+repo.id+"/archive",{fullName:confirmation})}>Confirm disconnect</button><button className="dp-btn" onClick={()=>setDisconnect("")}>Keep connected</button></> : <button className="dp-btn" disabled={busy} onClick={()=>{setDisconnect(repo.id);setConfirmation("");}}>Disconnect repository</button>}</Card>;
    })}</div>{archived.data?.repositories.map(repo=><Card key={repo.id}><h2>{repo.fullName} · Archived</h2><p>Restore after synchronizing GitHub access. Register new workers before deploying.</p><button className="dp-btn" disabled={busy} onClick={()=>void change("/v1/repositories/"+repo.id+"/restore")}>Restore repository</button></Card>)}{!loading && !error && !repositories.length && <Empty title="No repositories connected" text="Install the GitHub App on your personal account and synchronize its installation above." />}</>;
}
