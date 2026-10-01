"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "../../../lib/api";
import { RepositoryPicker, useRepository } from "../repository-context";
import { Card, LoadingCards, PageHeader } from "../ui";
import { Notice, useToast } from "../feedback";
import { ProfileHistory } from "./profile-history";
import { SourcePicker } from "./source-picker";
type Profile = { strategy: "DOCKERFILE"; dockerfilePath: string; dockerContext: string; port: number; healthcheckPath: string; timeoutSeconds: number; requiredSecretNames: string[]; buildArgs?: Record<string, string>; command?: string[] };
type Setup = { configs: { id: string; branchRule: string; version: number; profile: Profile }[]; environments: { id: string; name: string }[]; workers: { id: string; name: string; revokedAt: string | null; lastSeenAt: string | null }[] };
const initial: Profile = { strategy: "DOCKERFILE", dockerfilePath: "Dockerfile", dockerContext: ".", port: 3000, healthcheckPath: "/", timeoutSeconds: 900, requiredSecretNames: [] };
export default function DeployPage() {
  const { repoId, repositories, refresh } = useRepository();
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null), [branch, setBranch] = useState("main"), [branchRule, setBranchRule] = useState("main");
  const [configId, setConfigId] = useState(""), [environmentId, setEnvironmentId] = useState(""), [workerId, setWorkerId] = useState("");
  const [profile, setProfile] = useState<Profile>(initial), [args, setArgs] = useState("{}"), [command, setCommand] = useState("[]");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const notify = useToast();
  const [messageTone, setMessageTone] = useState<"info" | "error">("error");
  const [setupRetry, setSetupRetry] = useState(0);
  const autoDetect = useRef(true);
  const detectDockerfile = useCallback((path: string, sourceBranch: string, automatic: boolean) => {
    if (automatic && !autoDetect.current) return;
    setProfile(current => ({ ...current, dockerfilePath: path }));
    setBranchRule(sourceBranch);
    if (!automatic) { autoDetect.current = false; setMessageTone("info"); setMessage(`Selected ${path}. Review the build context, port and health check before saving.`); }
  }, []);
  const chooseBranch = (value: string) => {
    setBranch(value);
    if (autoDetect.current) { setProfile(current => ({ ...current, dockerfilePath: "Dockerfile" })); setBranchRule(value); }
  };
  const applySetup = (data: Setup) => { setSetup(data); setConfigId(data.configs[0]?.id ?? ""); setEnvironmentId(current => data.environments.some(e => e.id === current) ? current : data.environments[0]?.id ?? ""); setWorkerId(current => data.workers.some(w => w.id === current && !w.revokedAt) ? current : data.workers.find(w => !w.revokedAt && w.lastSeenAt && Date.now() - new Date(w.lastSeenAt).getTime() < 90000)?.id ?? ""); };
  useEffect(() => {
    let active = true; setSetup(null); setConfigId(""); setWorkerId(""); setEnvironmentId(""); setMessage(""); setMessageTone("error"); autoDetect.current = true;
    const defaultBranch = repositories.find(r => r.id === repoId)?.defaultBranch ?? "main";
    setBranch(defaultBranch); setBranchRule(defaultBranch); setProfile(initial); setArgs("{}"); setCommand("[]");
    if (repoId) void apiRequest<Setup>("/v1/repositories/" + repoId + "/setup").then(data => { if (active) applySetup(data); }).catch(e => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [repoId, setupRetry]);
  useEffect(() => {
    if (!setup) return;
    const matches = setup.configs.filter(c => c.branchRule === branch || c.branchRule === "*");
    setConfigId(current => matches.some(c => c.id === current) ? current : matches[0]?.id ?? "");
  }, [branch, setup]);
  async function saveProfile() {
    setBusy(true); setMessage(""); setMessageTone("error");
    try {
      await apiRequest("/v1/repositories/" + repoId + "/configs", { method: "POST", body: JSON.stringify({ branchRule, profile: { ...profile, buildArgs: JSON.parse(args), command: JSON.parse(command) } }) });
      autoDetect.current = false; applySetup(await apiRequest<Setup>("/v1/repositories/" + repoId + "/setup")); await refresh(); notify("New immutable profile version saved.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Invalid build profile"); }
    finally { setBusy(false); }
  }
  async function deploy() {
    setBusy(true); setMessage(""); setMessageTone("error");
    try { const run = await apiRequest<{ id: string }>("/v1/repositories/" + repoId + "/deployments", { method: "POST", body: JSON.stringify({ branch, configId, environmentId, workerId }) }); router.push("/dashboard/deployments/" + run.id); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to deploy"); }
    finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Release / Manual run" title="New deployment" description="DeployPilot resolves your branch to a fixed commit, builds its Dockerfile, starts a container, and verifies HTTP readiness." /><Card><RepositoryPicker />
    {setup && <div style={{ display: "grid", gap: 14, marginTop: 18 }}><SourcePicker key={repoId} repoId={repoId} branch={branch} onBranch={chooseBranch} onDetect={detectDockerfile} /><label className="dp-label">Profile version<select className="dp-select" value={configId} onChange={e => setConfigId(e.target.value)}><option value="">Choose profile</option>{setup.configs.filter(c => c.branchRule === branch || c.branchRule === "*").map(c => <option key={c.id} value={c.id}>{c.branchRule} · v{c.version}</option>)}</select></label>{branch && !setup.configs.some(c => c.branchRule === branch || c.branchRule === "*") && <p>Save a build profile for this branch below before deploying.</p>}<label className="dp-label">Environment<select className="dp-select" value={environmentId} onChange={e => setEnvironmentId(e.target.value)}><option value="">Choose environment</option>{setup.environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label className="dp-label">Worker<select className="dp-select" value={workerId} onChange={e => setWorkerId(e.target.value)}><option value="">Choose worker</option>{setup.workers.filter(w => !w.revokedAt).map(w => <option key={w.id} value={w.id}>{w.name} · {w.lastSeenAt && Date.now() - Date.parse(w.lastSeenAt) < 90000 ? "online" : "offline"}</option>)}</select></label><button className="dp-btn dp-btn-primary" disabled={busy || !configId || !environmentId || !workerId || !branch.trim()} onClick={deploy}>Deploy branch</button><p><Link href="/dashboard/environments">Manage environments</Link> · <Link href="/dashboard/workers">Set up a remote worker</Link></p></div>}<Notice message={message} tone={messageTone} dismiss={() => setMessage("")} retry={!setup && repoId && messageTone === "error" ? () => setSetupRetry(n => n + 1) : undefined} />{repoId && !setup && !message && <LoadingCards label="Loading deployment setup" count={2} />}</Card>
    {repoId && <Card style={{ marginTop: 18 }}><h2>Build profile editor</h2><p>Each save creates a version. Existing runs keep their original configuration. Install, test, and compile steps belong in the Dockerfile.</p>{setup?.configs.map(c => <button key={c.id} className="dp-btn" onClick={() => { autoDetect.current = false; setProfile({ ...initial, ...c.profile }); setBranchRule(c.branchRule); setArgs(JSON.stringify(c.profile.buildArgs ?? {}, null, 2)); setCommand(JSON.stringify(c.profile.command ?? [])); }}>Edit {c.branchRule} v{c.version}</button>)}
      <div onChange={() => { autoDetect.current = false; }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 16 }}>
        <label className="dp-label">Branch rule (exact name or *)<input className="dp-input" value={branchRule} onChange={e => setBranchRule(e.target.value)} /></label>
        <label className="dp-label">Dockerfile path<input className="dp-input" value={profile.dockerfilePath} onChange={e => setProfile({ ...profile, dockerfilePath: e.target.value })} /></label>
        <label className="dp-label">Build context<input className="dp-input" value={profile.dockerContext} onChange={e => setProfile({ ...profile, dockerContext: e.target.value })} /></label>
        <label className="dp-label">Container port<input className="dp-input" type="number" min={1} max={65535} value={profile.port} onChange={e => setProfile({ ...profile, port: Number(e.target.value) })} /></label>
        <label className="dp-label">HTTP health-check path<input className="dp-input" value={profile.healthcheckPath} onChange={e => setProfile({ ...profile, healthcheckPath: e.target.value })} /></label>
        <label className="dp-label">Timeout (seconds)<input className="dp-input" type="number" min={10} max={3600} value={profile.timeoutSeconds} onChange={e => setProfile({ ...profile, timeoutSeconds: Number(e.target.value) })} /></label>
        <label className="dp-label">Required runtime secret names (comma separated)<input className="dp-input" value={profile.requiredSecretNames.join(", ")} onChange={e=>setProfile({...profile,requiredSecretNames:e.target.value.split(",").map(v=>v.trim()).filter(Boolean)})} placeholder="DATABASE_URL, API_TOKEN" /></label>
        <label className="dp-label">Non-secret build arguments (JSON object)<textarea className="dp-input" value={args} onChange={e => setArgs(e.target.value)} /></label>
        <label className="dp-label">Startup arguments (JSON array; empty uses image default)<textarea className="dp-input" value={command} onChange={e => setCommand(e.target.value)} /></label>
      </div><button className="dp-btn dp-btn-primary" style={{ marginTop: 16 }} disabled={busy} onClick={saveProfile}>{busy ? "Saving…" : "Save profile version"}</button></Card>}{setup && setup.configs.length > 1 && <ProfileHistory key={repoId} versions={setup.configs} />}</>;
}
