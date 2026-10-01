import type { BuildProfile } from "@deploypilot/shared";

export type ClaimedJob = { deploymentId: string; commitSha: string; profile: BuildProfile; runtimeEnvironment?: Record<string, string>; reuseImageId?: string | null };

export class WorkerApi {
  constructor(private readonly apiUrl: string, private readonly workerId: string, private readonly workerToken: string) {}

  async claim() { return (await this.request<{ job: ClaimedJob | null }>(`/v1/workers/${encodeURIComponent(this.workerId)}/jobs/claim`, { method: "POST" })).job; }
  status(deploymentId: string) { return this.request<{ status: string }>(`/v1/workers/${encodeURIComponent(this.workerId)}/deployments/${encodeURIComponent(deploymentId)}/status`, { method: "GET" }); }
  async downloadSource(deploymentId: string, signal?: AbortSignal) {
    const response = await fetch(this.url(`/v1/workers/${encodeURIComponent(this.workerId)}/deployments/${encodeURIComponent(deploymentId)}/source`), { headers: this.headers(), signal: AbortSignal.any([AbortSignal.timeout(60000), ...(signal ? [signal] : [])]) });
    if (!response.ok) throw new Error(`Source download failed with HTTP ${response.status}`);
    if (!response.body) throw new Error("Source archive is empty");
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 50 * 1024 * 1024) throw new Error("Source archive exceeds 50 MiB");
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks);
  }
  stage(deploymentId: string, stage: string, status: "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED", message?: string) { return this.request(`/v1/workers/${encodeURIComponent(this.workerId)}/deployments/${encodeURIComponent(deploymentId)}/stages/${encodeURIComponent(stage)}`, { method: "POST", body: JSON.stringify({ status, message }) }); }
  log(deploymentId: string, stage: string, level: string, message: string) { return this.request(`/v1/workers/${encodeURIComponent(this.workerId)}/deployments/${encodeURIComponent(deploymentId)}/logs`, { method: "POST", body: JSON.stringify({ stage, level, message }) }); }
  logs(deploymentId: string, entries: { stage: string; level: string; message: string }[]) { return this.request(`/v1/workers/${encodeURIComponent(this.workerId)}/deployments/${encodeURIComponent(deploymentId)}/logs/batch`, { method: "POST", body: JSON.stringify({ entries }) }); }
  complete(deploymentId: string, status: "SUCCEEDED" | "FAILED" | "TIMED_OUT", message: string, endpoint?: string, imageId?: string) { return this.request(`/v1/workers/${encodeURIComponent(this.workerId)}/deployments/${encodeURIComponent(deploymentId)}/complete`, { method: "POST", body: JSON.stringify({ status, message, endpoint, imageId }) }); }
  runtimes() { return this.request<{ runtimes: { id: string; deploymentId: string; deployment: { config: { profile: BuildProfile } } }[] }>(`/v1/workers/${this.workerId}/runtimes`, { method: "GET" }); }
  runtimeCommand() { return this.request<{ command: { id: string; attempt: number; action: string; deploymentId: string } | null }>(`/v1/workers/${this.workerId}/runtime-commands/claim`, { method: "POST" }); }
  completeRuntimeCommand(id: string, success: boolean, attempt: number) { return this.request(`/v1/workers/${this.workerId}/runtime-commands/${encodeURIComponent(id)}/complete`, { method: "POST", body: JSON.stringify({ success, attempt }) }); }
  reportRuntime(id: string, state: string, endpoint?: string) { return this.request(`/v1/workers/${this.workerId}/runtimes/${encodeURIComponent(id)}/report`, { method: "POST", body: JSON.stringify({ state, endpoint }) }); }
  private async request<T = unknown>(path: string, init: RequestInit) {
    const response = await fetch(this.url(path), { ...init, signal: AbortSignal.timeout(45000), headers: { ...this.headers(), "Content-Type": "application/json", ...init.headers } });
    if (!response.ok) throw new Error(`Worker API request failed with HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  private headers() { return { Authorization: `Bearer ${this.workerToken}` }; }
  private url(path: string) { return `${this.apiUrl.replace(/\/$/, "")}${path}`; }
}
