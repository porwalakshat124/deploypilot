"use client";
import { useState } from "react";
import { apiRequest } from "../../../lib/api";
import { useApiResource } from "../../../lib/use-api-resource";
import { Notice, useFeedback } from "../feedback";
import { Card, LoadingCards } from "../ui";
type Account = { displayName: string; email: string; emailNotifications: string };
export function AccountSettings() {
  const resource = useApiResource<Account>("/v1/me");
  return <>{resource.loading && <LoadingCards count={1} label="Loading account" />}<Notice message={resource.error} retry={resource.reload} />{resource.data && <AccountForm key={resource.data.email + resource.data.displayName + resource.data.emailNotifications} account={resource.data} />}</>;
}
function AccountForm({ account }: { account: Account }) {
  const [name, setName] = useState(account.displayName || ""), [preference, setPreference] = useState(account.emailNotifications), [busy, setBusy] = useState(false);
  const feedback = useFeedback();
  return <Card style={{ marginBottom: 16 }}><h2>Your account</h2><p>{account.email}</p><form onSubmit={async e => { e.preventDefault(); setBusy(true); feedback.clear(); try { await apiRequest("/v1/me", { method: "PATCH", body: JSON.stringify({ displayName: name, emailNotifications: preference }) }); feedback.success("Account settings saved."); } catch (error) { feedback.fail(error, "Unable to save account"); } finally { setBusy(false); } }}><label className="dp-label">Display name<input className="dp-input" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><label className="dp-label">Deployment emails<select className="dp-select" value={preference} onChange={e => setPreference(e.target.value)}><option value="ALL">All results</option><option value="FAILURES">Failures and cancellations only</option><option value="OFF">Off</option></select></label><p>Results go to the personal repository owner or current team owner, according to their preference.</p><button className="dp-btn dp-btn-primary" disabled={busy}>Save account</button><Notice message={feedback.message} /></form></Card>;
}
