"use client";
import { useState } from "react";
import { apiRequest } from "../../../lib/api";
import { DeploymentPicker, CopyButton } from "../repository-context";
import { Card, PageHeader } from "../ui";
export default function AIPage() {
  const [id, setId] = useState(""), [result, setResult] = useState<unknown>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function diagnose() {
    setBusy(true); setResult(null);
    try { setResult(await apiRequest("/v1/deployments/" + id + "/diagnose", { method: "POST" })); setMessage(""); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Unable to diagnose"); }
    finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Intelligence / Evidence" title="AI diagnosis" description="Choose a failed deployment. Diagnosis uses redacted evidence and a server-side provider key." /><Card><div style={{ display: "grid", gap: 16 }}><DeploymentPicker value={id} onChange={setId} failedOnly /><button className="dp-btn dp-btn-primary" disabled={!id || busy} onClick={diagnose}>{busy ? "Analyzing…" : "Diagnose failure"}</button><p role="status">{message}</p></div></Card>{result != null && <Card style={{ marginTop: 16 }}><CopyButton value={JSON.stringify(result, null, 2)} label="Copy diagnosis" /><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre></Card>}</>;
}
