"use client";
import { useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useApiResource } from "../../../lib/use-api-resource";
import { Notice, useFeedback } from "../feedback";
import { Card, LoadingCards } from "../ui";
type EmailPreference = "ALL" | "FAILURES" | "OFF";
type Account = { displayName: string | null; email: string; emailNotifications: EmailPreference };
export function AccountSettings() {
  const resource = useApiResource<Account>("/v1/me");
  return <>{resource.loading && <LoadingCards count={1} label="Loading account" />}<Notice message={resource.error} retry={resource.reload} />{resource.data && <AccountForm key={resource.data.email + resource.data.displayName + resource.data.emailNotifications} account={resource.data} />}</>;
}
function AccountForm({ account }: { account: Account }) {
  const [name, setName] = useState(account.displayName || ""), [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  return <><Card style={{ marginBottom: 16 }}><h2>Your account</h2><p>{account.email}</p><form onSubmit={async e => { e.preventDefault(); setBusy(true); feedback.clear(); try { await apiRequest("/v1/me", { method: "PATCH", body: JSON.stringify({ displayName: name }) }); feedback.success("Account settings saved."); } catch (error) { feedback.fail(error, "Unable to save account"); } finally { setBusy(false); } }}><label className="dp-label">Display name<input className="dp-input" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><button className="dp-btn dp-btn-primary" disabled={busy}>Save account</button><Notice message={feedback.message} /></form></Card><EmailSettings account={account} /></>;
}

function EmailSettings({ account }: { account: Account }) {
  const [preference, setPreference] = useState(account.emailNotifications);
  const [saved, setSaved] = useState(account.emailNotifications);
  const [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  async function save(value: EmailPreference) {
    setBusy(true); feedback.clear();
    try {
      const updated = await apiRequest<Account>("/v1/me", { method: "PATCH", body: JSON.stringify({ emailNotifications: value }) });
      setPreference(updated.emailNotifications); setSaved(updated.emailNotifications);
      feedback.success(updated.emailNotifications === "OFF" ? "Unsubscribed. Deployment emails and operational alerts are now off." : "Email preferences saved.");
    } catch (error) { feedback.fail(error, "Unable to save email preferences"); }
    finally { setBusy(false); }
  }
  return <Card style={{ marginBottom: 16 }}><h2>Email notifications</h2>
    <p>Control emails sent to {account.email}. Turning emails off also stops operational alerts sent to this account.</p>
    <p role="status">{saved === "OFF" ? "You are unsubscribed from DeployPilot emails." : saved === "FAILURES" ? "Receiving deployment failures, cancellations and operational alerts." : "Receiving deployment results and operational alerts."}</p>
    <form onSubmit={e => { e.preventDefault(); void save(preference); }}>
      <label className="dp-label">Email preference<select className="dp-select" disabled={busy} value={preference} onChange={e => setPreference(e.target.value as EmailPreference)}>
        <option value="ALL">All deployment results and operational alerts</option>
        <option value="FAILURES">Failures, cancellations and operational alerts only</option>
        <option value="OFF">Off — unsubscribe from all DeployPilot emails</option>
      </select></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        <button className="dp-btn dp-btn-primary" disabled={busy || preference === saved}>{busy ? "Saving…" : "Save email preferences"}</button>
        <button type="button" className="dp-btn" disabled={busy || saved === "OFF"} onClick={() => void save("OFF")}>Unsubscribe from all emails</button>
      </div>
    </form>
    <p>You can turn emails back on here at any time. Dashboard status and logs remain available. An email already being sent may still arrive.</p>
    <Notice message={feedback.message} />
  </Card>;
}
