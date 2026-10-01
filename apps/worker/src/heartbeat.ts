export async function sendHeartbeat(apiUrl: string, workerId: string, token: string, version: string) {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/workers/${encodeURIComponent(workerId)}/heartbeat`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version, capabilities: { docker: true, apiPolling: true, maxConcurrency: 1, runtimeSecrets: true, runtimeManagement: true } }),
  });
  if (!response.ok) throw new Error(`Worker heartbeat failed with HTTP ${response.status}`);
  return response.json() as Promise<{ workerId: string; status: string; lastSeenAt: string }>;
}
