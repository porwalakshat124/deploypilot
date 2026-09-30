"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "../../../lib/api";
import { DeploymentPicker, CopyButton } from "../repository-context";
import { Card, PageHeader } from "../ui";
import { Notice, useFeedback } from "../feedback";
export default function AIPage() {
  const [id, setId] = useState(""), [result, setResult] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  useEffect(() => { setResult(null); feedback.clear(); }, [id]);
  async function diagnose() {
    setBusy(true); setResult(null); feedback.clear();
    try { setResult(await apiRequest("/v1/deployments/" + id + "/diagnose", { method: "POST" })); feedback.success("Diagnosis is ready."); }
    catch (e) { feedback.fail(e, "Unable to diagnose"); }
    finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="Intelligence / Evidence" title="AI diagnosis" description="Choose a failed deployment. Diagnosis uses redacted evidence and a server-side provider key." /><Card><div style={{ display: "grid", gap: 16 }}><DeploymentPicker value={id} onChange={setId} failedOnly /><button className="dp-btn dp-btn-primary" disabled={!id || busy} onClick={diagnose}>{busy ? "Analyzing…" : "Diagnose failure"}</button><Notice message={feedback.message} dismiss={feedback.clear} /></div></Card>{result != null && <Card style={{ marginTop: 16 }}><CopyButton value={JSON.stringify(result, null, 2)} label="Copy diagnosis" /><pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre></Card>}</>;
}
