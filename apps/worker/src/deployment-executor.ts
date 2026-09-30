import { DockerAdapter } from "./docker-adapter.js";
import { withSourceWorkspace } from "./source-workspace.js";
import type { ClaimedJob, WorkerApi } from "./worker-api.js";

export class DeploymentExecutor {
  private active = new Set<string>();
  constructor(private readonly docker = new DockerAdapter(), private readonly source = withSourceWorkspace) {}
  async execute(job: ClaimedJob, api: WorkerApi, shutdown?: AbortSignal) {
    if (this.active.has(job.deploymentId)) return { status: "DUPLICATE" };
    this.active.add(job.deploymentId);
    const abort = new AbortController();
    const stop = () => abort.abort(new Error("Worker is shutting down"));
    shutdown?.addEventListener("abort", stop, { once: true });
    if (shutdown?.aborted) stop();
    const timeout = setTimeout(() => abort.abort(new Error("Deployment timed out")), Math.min(job.profile.timeoutSeconds || 900, 3600) * 1000);
    let cancelled = false, checking = false, committed = false, finalizing = false, preserve = false, stage = "docker-build";
    let logs = Promise.resolve();
    let queuedLogs = 0;
    const output = (line: string) => {
      if (++queuedLogs > 500) { abort.abort(new Error("Log delivery cannot keep up with build output")); queuedLogs--; return; }
      const logStage = stage;
      logs = logs.then(() => api.log(job.deploymentId, logStage, "info", line)).then(() => { queuedLogs--; }).catch(error => { queuedLogs--; abort.abort(error); });
    };
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const state = await api.status(job.deploymentId);
        if (state.status !== "RUNNING") { cancelled = true; abort.abort(new Error("Deployment cancelled or no longer active")); }
      } catch { abort.abort(new Error("Lost contact with the control plane")); }
      finally { checking = false; }
    };
    const poll = setInterval(() => void check(), 2000);
    const name = "deploypilot-" + job.deploymentId;
    const options = { signal: abort.signal, onOutput: output };
    const policy = { timeoutSeconds: Math.min(job.profile.timeoutSeconds || 900, 3600), memoryLimitMb: 1024, cpuLimit: 1, pidsLimit: 256, networkMode: process.env.WORKER_BUILD_NETWORK === "none" ? "none" as const : "bridge" as const };
    try {
      await check();
      abort.signal.throwIfAborted();
      if (!job.profile.port || !job.profile.healthcheckPath) throw new Error("Save a build profile with a container port and HTTP health-check path before deploying");
      await api.log(job.deploymentId, "system", "info", "Worker claimed immutable commit " + job.commitSha);
      for (const skipped of ["dependencies", "tests"]) await api.stage(job.deploymentId, skipped, "SKIPPED", "Declare this step in the repository Dockerfile");
      await api.stage(job.deploymentId, stage, "RUNNING", "Downloading source and building Docker image");
      const archive = await api.downloadSource(job.deploymentId, abort.signal);
      await this.source(archive, async workspace => { await this.docker.build(name, workspace, job.profile, policy, options); }, abort.signal);
      await logs;
      abort.signal.throwIfAborted();
      await api.stage(job.deploymentId, stage, "SUCCEEDED");
      stage = "health-check";
      await api.stage(job.deploymentId, stage, "RUNNING", "Starting a restricted container and checking HTTP readiness");
      await this.docker.start(name, name, job.profile, policy, options);
      const endpoint = await this.docker.health(name, job.profile, options);
      await this.docker.logs(name, output);
      await logs;
      abort.signal.throwIfAborted();
      await api.stage(job.deploymentId, stage, "SUCCEEDED", "HTTP health check passed");
      stage = "deploy";
      await api.stage(job.deploymentId, stage, "RUNNING");
      await api.log(job.deploymentId, stage, "info", "Container " + name + " is running at " + endpoint + " on the worker host. Public ingress is configured separately.");
      await api.stage(job.deploymentId, stage, "SUCCEEDED");
      await check();
      abort.signal.throwIfAborted();
      finalizing = true;
      await api.complete(job.deploymentId, "SUCCEEDED", "Container started and HTTP health check passed");
      committed = true;
      return { status: "SUCCEEDED" };
    } catch (error) {
      if (finalizing) {
        try {
          const state = await api.status(job.deploymentId);
          if (state.status === "SUCCEEDED") { committed = true; return { status: "SUCCEEDED" }; }
          if (state.status === "CANCELLED") cancelled = true;
        } catch {
          // The completion may have committed even if its response was lost.
          preserve = true;
          console.error("[worker] completion unconfirmed; preserving container for", job.deploymentId);
          return { status: "UNKNOWN" };
        }
      }
      await this.docker.logs(name, output).catch(() => undefined);
      await logs;
      const message = error instanceof Error ? error.message : "Deployment failed";
      const status = cancelled ? "CANCELLED" : /timed out/i.test(message) ? "TIMED_OUT" : "FAILED";
      if (!cancelled) {
        await api.stage(job.deploymentId, stage, "FAILED", message).catch(() => undefined);
        await api.complete(job.deploymentId, status === "TIMED_OUT" ? "TIMED_OUT" : "FAILED", message).catch(() => undefined);
      }
      return { status };
    } finally {
      clearTimeout(timeout);
      clearInterval(poll);
      shutdown?.removeEventListener("abort", stop);
      if (!committed && !preserve) await this.docker.cleanup(name, name);
      this.active.delete(job.deploymentId);
    }
  }
}
