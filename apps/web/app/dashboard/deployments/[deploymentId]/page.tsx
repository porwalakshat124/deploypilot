"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../lib/api";
import { watchDeployment } from "../../../../lib/deployment-stream";
import { CopyButton } from "../../repository-context";
import { Badge, Card, PageHeader, formatDate } from "../../ui";
type Detail = { id: string; status: string; commitSha: string; targetWorkerId: string; createdAt: string; startedAt: string | null; endedAt: string | null; repository: { fullName: string }; environment: { name: string; url: string | null } | null; stages: { name: string; status: string; startedAt: string | null; endedAt: string | null }[]; config: { branchRule: string; version: number; profile: unknown }; diagnosis: { response: unknown } | null; events: { id: string; type: string; createdAt: string; payload: unknown }[] };
type Log = { sequence: number; stage: string; level: string; message: string; createdAt: string };
export default function DetailPage() {
  const { deploymentId } = useParams<{ deploymentId: string }>(), router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null), [logs, setLogs] = useState<Log[]>([]);
  const [connection, setConnection] = useState("Connecting…"), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""), [level, setLevel] = useState(""), [stage, setStage] = useState("");
  const [diagnosis, setDiagnosis] = useState<unknown>(null);
  useEffect(() => {
    const abort = new AbortController();
    let cursor = 0, refreshing = false, dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setDetail(null); setLogs([]); setDiagnosis(null);
    const refresh = async () => {
      if (refreshing || abort.signal.aborted) { dirty = true; return; }
      refreshing = true; dirty = false;
      try {
        const data = await apiRequest<Detail>("/v1/deployments/" + deploymentId, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setDetail(data); if (data.diagnosis) setDiagnosis(data.diagnosis.response);
        let more = true;
        while (more && !abort.signal.aborted) {
          const page = await apiRequest<{ logs: Log[]; nextCursor: number; hasMore: boolean }>("/v1/deployments/" + deploymentId + "/logs?limit=500&cursor=" + cursor, { signal: abort.signal });
          cursor = page.nextCursor; more = page.hasMore;
          if (!abort.signal.aborted) setLogs(previous => [...new Map([...previous, ...page.logs].map(log => [log.sequence, log])).values()].sort((a, b) => a.sequence - b.sequence));
        }
        if (!["QUEUED", "RUNNING"].includes(data.status)) { setConnection("Complete"); abort.abort(); }
      } catch (e) { if (!abort.signal.aborted) setMessage(e instanceof Error ? e.message : "Unable to refresh"); }
      finally { refreshing = false; if (dirty && !abort.signal.aborted) schedule(); }
    };
    const schedule = () => { if (!timer) timer = setTimeout(() => { timer = undefined; void refresh(); }, 300); };
    void refresh();
    void watchDeployment(deploymentId, abort.signal, schedule, setConnection);
    return () => { abort.abort(); if (timer) clearTimeout(timer); };
  }, [deploymentId]);
  async function action(name: string) {
    if (name === "cancel" && !window.confirm("Cancel this deployment?")) return;
    setBusy(true);
    try {
      const result = await apiRequest<{ id?: string }>("/v1/deployments/" + deploymentId + "/" + name, { method: "POST" });
      if (name === "retry" && result.id) router.push("/dashboard/deployments/" + result.id);
      if (name === "diagnose") setDiagnosis(result);
      setMessage(name === "cancel" ? "Cancellation requested." : "");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(false); }
  }
  const filtered = logs.filter(l => (!stage || l.stage === stage) && (!level || l.level === level) && l.message.toLowerCase().includes(search.toLowerCase()));
  function download() {
    const url = URL.createObjectURL(new Blob([logs.map(l => l.sequence + " [" + l.stage + "/" + l.level + "] " + l.message).join("\n")], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = "deployment-" + deploymentId + ".log"; a.click(); URL.revokeObjectURL(url);
  }
  if (!detail) return <><PageHeader eyebrow="Operations / Deployment" title="Deployment detail" /><Card>{message || "Loading deployment…"}</Card></>;
  return <><PageHeader eyebrow={"Operations / " + detail.repository.fullName} title={detail.commitSha.slice(0, 12)} description={detail.environment?.name + " · profile " + detail.config.branchRule + " v" + detail.config.version} action={<Badge status={detail.status} />} />
    <Card><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><CopyButton value={deploymentId} label="Copy deployment ID" /><CopyButton value={detail.commitSha} label="Copy commit" />{["QUEUED", "RUNNING"].includes(detail.status) && <button className="dp-btn dp-btn-danger" disabled={busy} onClick={() => action("cancel")}>Cancel</button>}{["FAILED", "CANCELLED", "TIMED_OUT"].includes(detail.status) && <button className="dp-btn" disabled={busy} onClick={() => action("retry")}>Retry</button>}{detail.status === "FAILED" && <button className="dp-btn dp-btn-primary" disabled={busy} onClick={() => action("diagnose")}>Diagnose failure</button>}</div><p role="status">{message || connection}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 16 }}>{["dependencies", "tests", "docker-build", "health-check", "deploy"].map(name => { const s = detail.stages.find(s => s.name === name); return <div key={name}><p>{name}</p><Badge status={s?.status ?? "PENDING"} />{s?.startedAt && <p>{Math.max(0, Math.round(((s.endedAt ? Date.parse(s.endedAt) : Date.now()) - Date.parse(s.startedAt)) / 1000))}s</p>}</div>; })}</div>
    </Card><Card style={{ marginTop: 16 }}><h2>Logs · {connection}</h2><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><input className="dp-input" style={{ maxWidth: 300 }} aria-label="Search logs" placeholder="Search logs" value={search} onChange={e => setSearch(e.target.value)} /><select className="dp-select" style={{ width: 170 }} aria-label="Log stage" value={stage} onChange={e => setStage(e.target.value)}><option value="">All stages</option>{[...new Set(logs.map(l => l.stage))].map(s => <option key={s}>{s}</option>)}</select><select className="dp-select" style={{ width: 140 }} aria-label="Log level" value={level} onChange={e => setLevel(e.target.value)}><option value="">All levels</option><option>info</option><option>error</option><option>warn</option></select><button className="dp-btn" onClick={download}>Download logs</button></div><pre className="dp-mono" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#080a0e", padding: 16, maxHeight: 520, overflow: "auto", fontSize: 12 }}>{filtered.map(l => <div key={l.sequence} style={{ color: l.level === "error" ? "var(--red)" : "#bdc8d8" }}>{l.sequence} [{l.stage}/{l.level}] {l.message}</div>)}{!logs.length && "Waiting for worker output…"}</pre></Card>
    <Card style={{ marginTop: 16 }}><h2>Run details</h2><p>Worker: <code>{detail.targetWorkerId}</code></p><p>Created {formatDate(detail.createdAt)} · Started {formatDate(detail.startedAt)} · Finished {formatDate(detail.endedAt)}</p>{detail.environment?.url && /^https?:\/\//.test(detail.environment.url) && <a className="dp-btn" href={detail.environment.url} target="_blank" rel="noreferrer">Open environment</a>}<details><summary>Build profile</summary><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(detail.config.profile, null, 2)}</pre></details><details><summary>Recent events</summary>{detail.events.map(event => <p key={event.id}>{formatDate(event.createdAt)} · {event.type}<br /><code>{JSON.stringify(event.payload)}</code></p>)}</details></Card>
    {diagnosis != null && <Card style={{ marginTop: 16 }}><h2>Failure diagnosis</h2><CopyButton value={JSON.stringify(diagnosis, null, 2)} label="Copy diagnosis" /><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(diagnosis, null, 2)}</pre></Card>}</>;
}
