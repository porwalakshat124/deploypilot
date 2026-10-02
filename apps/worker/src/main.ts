import dotenv from "dotenv";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
import { setTimeout as delay } from "node:timers/promises";
import { RuntimeMonitor } from "./runtime-monitor.js";
import { DeploymentExecutor } from "./deployment-executor.js";
import { sendHeartbeat } from "./heartbeat.js";
import { WorkerApi } from "./worker-api.js";
import { runProcess } from "./process-runner.js";
import { checkControlPlane } from "./preflight.js";

const apiUrl = process.env.WORKER_API_URL ?? "http://localhost:4000";
const workerId = process.env.WORKER_ID;
const workerToken = process.env.WORKER_TOKEN;
const version = process.env.WORKER_VERSION ?? "1.3.0";
if (!workerId || !workerToken) throw new Error("WORKER_ID and WORKER_TOKEN are required");
const endpoint = new URL(apiUrl);
if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))) throw new Error("Remote workers require an HTTPS API URL");
if (endpoint.username || endpoint.password) throw new Error("Do not put credentials in WORKER_API_URL");
await runProcess("docker", ["info", "--format", "{{.OSType}}"], 15000).then(result => { if (result.output.trim() !== "linux") throw new Error("The worker requires a Linux Docker engine"); });
await runProcess("docker", ["buildx", "version"], 15000);
if (process.argv.includes('--check')) {
  await checkControlPlane(apiUrl,workerId,workerToken);
  console.log('[worker] preflight passed; no job claimed');
} else {
const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
process.once("SIGTERM", () => abort.abort());
const api = new WorkerApi(apiUrl, workerId, workerToken);
const executor = new DeploymentExecutor();
const monitor = new RuntimeMonitor();
let heartbeating = false;
async function heartbeat() {
  if (heartbeating) return;
  heartbeating = true;
  try { await sendHeartbeat(apiUrl, workerId!, workerToken!, version); }
  catch (error) { console.error("[worker] heartbeat failed", error instanceof Error ? error.message : "error"); }
  finally { heartbeating = false; }
}
// Startup must authenticate successfully before an upgrade is considered healthy.
await sendHeartbeat(apiUrl,workerId,workerToken,version);
const runtimeTimer = setInterval(() => void monitor.tick(api).catch(() => console.error("[worker] runtime monitoring unavailable")), 15000);
const heartbeatTimer = setInterval(() => void heartbeat(), 30000);
console.log("[worker] ready; polling control plane for jobs");
try {
  while (!abort.signal.aborted) {
    try {
      const job = await api.claim();
      if (job) console.log("[worker]", job.deploymentId, (await executor.execute(job, api, abort.signal)).status);
    } catch (error) { console.error("[worker] poll failed", error instanceof Error ? error.message : "error"); }
    await delay(5000, undefined, { signal: abort.signal }).catch(() => undefined);
  }
} finally { clearInterval(heartbeatTimer); clearInterval(runtimeTimer); }
}
