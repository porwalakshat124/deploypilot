import { DockerAdapter } from "./docker-adapter.js";
import type { WorkerApi } from "./worker-api.js";
export class RuntimeMonitor {
  private busy = false;
  constructor(private readonly docker = new DockerAdapter()) {}
  async tick(api: WorkerApi) {
    if (this.busy) return;
    this.busy = true;
    try {
      const { command } = await api.runtimeCommand();
      if (command) {
        if (!/^[a-f0-9-]{36}$/.test(command.deploymentId) || !["STOP", "START", "RESTART"].includes(command.action)) throw new Error("Invalid runtime command");
        let success = false;
        try { await this.docker.runtimeAction("deploypilot-" + command.deploymentId, command.action as "STOP" | "START" | "RESTART"); success = true; } catch { /* Report only status; Docker errors may contain application data. */ }
        await api.completeRuntimeCommand(command.id, success, command.attempt);
      }
      const { runtimes } = await api.runtimes();
      for (const runtime of runtimes) {
        if (!/^[a-f0-9-]{36}$/.test(runtime.deploymentId)) continue;
        const name = "deploypilot-" + runtime.deploymentId;
        const running = await this.docker.running(name);
        let state = running === null ? "MISSING" : running ? "UNHEALTHY" : "STOPPED", endpoint: string | undefined;
        if (running) {
          // One bounded check per pass; continuous monitoring must not block for readiness retries.
          try {
            const result = await this.docker.runtimeEndpoint(name, runtime.deployment.config.profile);
            endpoint = result;
            const url = new URL(runtime.deployment.config.profile.healthcheckPath!, result);
            if (url.origin !== result) throw new Error("Unsafe runtime health path");
            const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: "manual" });
            await response.body?.cancel(); state = response.ok ? "HEALTHY" : "UNHEALTHY";
          } catch { state = "UNHEALTHY"; }
        }
        await api.reportRuntime(runtime.id, state, endpoint);
      }
    } finally { this.busy = false; }
  }
}
