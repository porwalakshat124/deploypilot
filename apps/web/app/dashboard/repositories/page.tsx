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
  const [github, setGithub] = useState<{installationId:string|null;accountLogin:string;installUrl:string}|null>(null);
  const [available, setAvailable] = useState<{id:string;fullName:string;defaultBranch:string;imported:boolean}[]|null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [repositoryPage, setRepositoryPage] = useState(0);
  const [importing, setImporting] = useState(false);
  async function importGithub() {
    setBusy(true); feedback.clear(); setAvailable(null); setSelected([]); setSearch(""); setRepositoryPage(0);
    try {
      const connection = await apiRequest<{installationId:string|null;accountLogin:string;installUrl:string}>("/v1/github/installation");
      setGithub(connection);
      if (!connection.installationId) { feedback.success("Connect the GitHub App below, choose repositories on GitHub, then return and load them."); return; }
      const result = await apiRequest<{repositories:NonNullable<typeof available>}>("/v1/github/installations/" + encodeURIComponent(connection.installationId) + "/available-repositories");
      setAvailable(result.repositories);
    } catch(e) { feedback.fail(e,"Unable to import GitHub repositories"); }
    finally { setBusy(false); }
  }
  async function importSelected() {
    if (!github?.installationId || !selected.length) return;
    setImporting(true); feedback.clear();
    try {
      await apiRequest("/v1/github/installations/" + encodeURIComponent(github.installationId) + "/repositories", {method:"POST",body:JSON.stringify({repositoryIds:selected})});
      await refresh(); archived.reload();
      setAvailable(current=>current?.map(repo=>selected.includes(repo.id)?{...repo,imported:true}:repo)??null);
      setSelected([]); feedback.success("Selected repositories imported. Choose Configure and deploy to finish setup.");
    } catch(e) {feedback.fail(e,"Unable to import selected repositories");}
    finally {setImporting(false);}
  }
  const visibleRepositories = available?.filter(repo=>repo.fullName.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  const displayedRepositories = visibleRepositories.slice(repositoryPage * 100, (repositoryPage + 1) * 100);
  async function sync() {
    setBusy(true); feedback.clear();
    try { await apiRequest("/v1/github/installations/" + encodeURIComponent(installationId.trim()) + "/repositories" + (teamId ? "?teamId="+encodeURIComponent(teamId) : ""),teamId ? {headers:{"X-GitHub-Token":await githubProviderToken()}} : undefined); await refresh(); feedback.success("Repositories synchronized."); }
    catch (e) { feedback.fail(e, "Unable to sync repositories"); }
    finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Setup / Source control" title="Repositories" description="Connected GitHub sources, configuration readiness, and latest deployments." />
    <Card><h2>Import from GitHub</h2><p>Load repositories from your signed-in GitHub account. GitHub lets you choose which repositories DeployPilot can access.</p><button className="dp-btn dp-btn-primary" disabled={busy || importing} onClick={()=>void importGithub()}>{busy ? "Loading repositories…" : "Import GitHub repository"}</button>{github && <p>Account: <strong>{github.accountLogin}</strong>. <a className="dp-btn" href={github.installUrl} target="_blank" rel="noreferrer">{github.installationId ? "Change GitHub repository access" : "Connect GitHub App"}</a></p>}<ol><li>Connect the GitHub App and select your repositories.</li><li>Load the list, select repositories, then import and choose Configure and deploy.</li><li>Select a Dockerfile, build profile and environment, and connect your own Docker worker.</li></ol><p>DeployPilot builds and runs apps on your worker. Keep it online. App addresses are local to the worker until you configure public routing.</p><Notice message={feedback.message} dismiss={feedback.clear} /></Card>
    {available && <Card>
      <h2>Select repositories</h2><p>{available.length} repositories loaded from GitHub. {selected.length} selected.</p>
      <p>Only repositories granted to the DeployPilot GitHub App appear here. To load every repository, choose All repositories in GitHub App access, then reload this list.</p>
      <label className="dp-label">Search repositories<input className="dp-input" type="search" value={search} onChange={e=>{setSearch(e.target.value);setRepositoryPage(0);}} placeholder="Search by repository name" /></label>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}><button className="dp-btn" disabled={importing || !visibleRepositories.some(repo=>!repo.imported)} onClick={()=>setSelected(current=>Array.from(new Set([...current,...visibleRepositories.filter(repo=>!repo.imported).map(repo=>repo.id)])))}>Select all matching</button><button className="dp-btn" disabled={importing || !selected.length} onClick={()=>setSelected([])}>Clear selection</button></div>
      <div role="group" aria-label="Available GitHub repositories" style={{maxHeight:360,overflowY:"auto",border:"1px solid var(--line)",borderRadius:10,padding:12}}>{displayedRepositories.map(repo=><label key={repo.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 4px",borderBottom:"1px solid var(--line)",overflowWrap:"anywhere"}}><input type="checkbox" disabled={importing || repo.imported} checked={repo.imported || selected.includes(repo.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,repo.id]:current.filter(id=>id!==repo.id))} /><span>{repo.fullName}<small style={{display:"block",color:"var(--muted)"}}>{repo.imported?"Already imported":"Branch: "+repo.defaultBranch}</small></span></label>)}{!visibleRepositories.length && <p>{available.length?"No repositories match your search.":"No accessible repositories found. Change GitHub repository access, then reload the list."}</p>}</div>
      {visibleRepositories.length > 100 && <nav aria-label="Repository list pages" style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap",marginTop:12}}><button className="dp-btn" disabled={repositoryPage===0} onClick={()=>setRepositoryPage(page=>page-1)}>Previous</button><span>Page {repositoryPage+1} of {Math.ceil(visibleRepositories.length/100)}</span><button className="dp-btn" disabled={(repositoryPage+1)*100>=visibleRepositories.length} onClick={()=>setRepositoryPage(page=>page+1)}>Next</button></nav>}
      <button className="dp-btn dp-btn-primary" style={{marginTop:16}} disabled={importing || !selected.length} onClick={()=>void importSelected()}>{importing?"Importing selected repositories…":"Import selected repositories ("+selected.length+")"}</button>
    </Card>}
    <details style={{marginTop:18}}><summary>Advanced: organization or installation ID</summary><Card><label className="dp-label">GitHub App installation ID<input className="dp-input" value={installationId} onChange={e => setInstallationId(e.target.value)} /></label><label className="dp-label">Organization team (personal installation: leave empty)<select className="dp-select" value={teamId} onChange={e=>setTeam(e.target.value)}><option value="">Personal GitHub account</option>{teams.data?.teams.filter(t=>!t.archivedAt && ["OWNER","ADMIN"].includes(t.members[0]?.role)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{teamId && <p>Connecting requires ownership of the GitHub organization and administrator access to this team. <button className="dp-btn" disabled={busy} onClick={()=>void authorizeOrganizations().catch(e=>feedback.fail(e,"Unable to authorize GitHub"))}>Authorize organization access</button></p>}<button className="dp-btn dp-btn-primary" disabled={busy || !installationId.trim()} onClick={sync}>{busy ? "Synchronizing…" : "Sync repositories"}</button></Card></details>
    <Notice message={error} retry={() => void refresh()} />{loading && <LoadingCards label="Loading repositories" />}
    <div style={{ display: "grid", gap: 14, marginTop: 18 }}>{repositories.map(repo => {
      const online = repo.workers.some(w => w.lastSeenAt && Date.now() - Date.parse(w.lastSeenAt) < 90000);
      const ready = repo._count.configs > 0 && repo._count.environments > 0 && online;
      return <Card key={repo.id}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><h2>{repo.fullName}</h2><Badge status={ready ? "READY" : "SETUP REQUIRED"} /></div><p>Default branch: <code>{repo.defaultBranch}</code></p><p>Profiles: {repo._count.configs} · Environments: {repo._count.environments} · Worker: {online ? "online" : "offline"}</p><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><a className="dp-btn" href={"https://github.com/" + repo.fullName} target="_blank" rel="noreferrer">View on GitHub</a><Link className="dp-btn dp-btn-primary" onClick={() => setRepoId(repo.id)} href={"/dashboard/deploy?repositoryId=" + repo.id}>Configure and deploy</Link>{repo.deployments[0] && <Link className="dp-btn" href={"/dashboard/deployments/" + repo.deployments[0].id}>Latest: {repo.deployments[0].status}</Link>}</div><label style={{display:"block",marginTop:12}}><input type="checkbox" checked={repo.previewEnabled} disabled={busy} onChange={e=>void change("/v1/repositories/"+repo.id+"/previews",{enabled:e.target.checked},"PATCH")} /> Enable pull request previews</label><p>Previews use a matching branch profile or *. Forks and profiles requiring secrets are excluded. A version 1.2 worker and the GitHub App pull_request event subscription are required. Preview addresses are local to the worker.</p>{disconnect===repo.id ? <><label className="dp-label">Type {repo.fullName} to disconnect<input className="dp-input" value={confirmation} onChange={e=>setConfirmation(e.target.value)} /></label><button className="dp-btn dp-btn-danger" disabled={busy || confirmation!==repo.fullName} onClick={()=>void change("/v1/repositories/"+repo.id+"/archive",{fullName:confirmation})}>Confirm disconnect</button><button className="dp-btn" onClick={()=>setDisconnect("")}>Keep connected</button></> : <button className="dp-btn" disabled={busy} onClick={()=>{setDisconnect(repo.id);setConfirmation("");}}>Disconnect repository</button>}</Card>;
    })}</div>{archived.data?.repositories.map(repo=><Card key={repo.id}><h2>{repo.fullName} · Archived</h2><p>Restore after synchronizing GitHub access. Register new workers before deploying.</p><button className="dp-btn" disabled={busy} onClick={()=>void change("/v1/repositories/"+repo.id+"/restore")}>Restore repository</button></Card>)}{!loading && !error && !repositories.length && <Empty title="No repositories connected" text="Use Import GitHub repository above to connect your account and import a repository." />}</>;
}
