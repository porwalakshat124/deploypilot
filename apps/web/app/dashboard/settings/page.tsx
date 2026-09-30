"use client";
import { useApiResource } from "../../../lib/use-api-resource";
import { Card, PageHeader, Badge, LoadingCards } from "../ui";
import { Notice } from "../feedback";
type Settings = { integrations: { name: string; configured: boolean; description: string }[]; failedDeliveries: number; workerProtocol: string; providerDelivery: string };
export default function SettingsPage() {
  const { data: settings, error, loading, reload } = useApiResource<Settings>("/v1/settings");
  return <><PageHeader eyebrow="Workspace / Configuration" title="Settings" description="Provider credentials stay on the API server." />
    <Notice message={error} retry={reload} />
    {loading && <LoadingCards label="Checking server configuration" />}
    {settings && <><Card><h2>Server configuration</h2><p>{settings.providerDelivery}</p><p>Worker transport: {settings.workerProtocol}</p><p>Provider deliveries requiring attention: {settings.failedDeliveries}</p></Card>
    <div style={{ display:"grid",gap:12,marginTop:16 }}>{settings.integrations.map(item => <Card key={item.name}><div style={{ display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:12 }}><div><strong>{item.name}</strong><p>{item.description}</p></div><Badge status={item.configured ? "CONFIGURED" : "NOT CONFIGURED"} /></div></Card>)}</div></>}
    <Card style={{ marginTop:16 }}><h2>Worker availability</h2><p>This Windows worker requires Docker Desktop's Linux engine. Keep the PC awake while deployments run. The worker starts at user login and reconnects automatically.</p><p>Public application routing requires an ingress or tunnel configured for the worker host.</p></Card>
  </>;
}
