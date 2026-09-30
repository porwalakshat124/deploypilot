import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { BuildProfile } from "@deploypilot/shared";
import { runProcess, type Runner, type RunOptions } from "./process-runner.js";

export type DockerExecutionPolicy = { timeoutSeconds: number; memoryLimitMb: number; cpuLimit: number; pidsLimit: number; networkMode: "none" | "bridge" };

export function sourcePath(workspace: string, path: string) {
  if (!path || isAbsolute(path) || path.includes("\\") || path.includes(":") || path.includes("\0") || path.startsWith("-") || path.split("/").includes("..")) throw new Error("Unsafe source path");
  const root = realpathSync(workspace);
  const target = realpathSync(resolve(root, path));
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Source path escapes workspace");
  return target;
}

export class DockerAdapter {
  constructor(private readonly run: Runner = runProcess) {}
  async build(image: string, context: string, profile: BuildProfile, policy: DockerExecutionPolicy, options: RunOptions = {}) {
    this.assertSafe(image, context, policy);
    if (profile.strategy !== "DOCKERFILE" || !Number.isFinite(profile.timeoutSeconds) || profile.timeoutSeconds < 10) throw new Error("Unsupported build profile");
    const workspace = sourcePath(context, profile.dockerContext ?? ".");
    const dockerfile = sourcePath(context, profile.dockerfilePath ?? "Dockerfile");
    if (!statSync(dockerfile).isFile() || !statSync(workspace).isDirectory()) throw new Error("Invalid Dockerfile or build context");
    const builder = image + "-builder";
    let abortCleanup: Promise<unknown> | undefined;
    const stopBuilder = () => {
      // Killing the client alone can leave BuildKit executing on the daemon.
      abortCleanup ??= this.run("docker", ["rm", "--force", "buildx_buildkit_" + builder + "0"], 10000).catch(() => undefined);
    };
    const args = ["buildx", "build", "--builder", builder, "--load", "--progress=plain", "--network", policy.networkMode === "none" ? "none" : "default", "--file", dockerfile, "--tag", image];
    for (const [key, value] of Object.entries(profile.buildArgs ?? {})) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /secret|token|password|key/i.test(key) || typeof value !== "string" || value.includes("\0")) throw new Error("Unsafe build argument");
      args.push("--build-arg", key + "=" + value);
    }
    options.signal?.addEventListener("abort", stopBuilder, { once: true });
    try {
      await this.run("docker", ["buildx", "create", "--name", builder, "--driver", "docker-container", "--driver-opt", "memory=" + policy.memoryLimitMb + "m", "--driver-opt", "memory-swap=" + policy.memoryLimitMb + "m", "--driver-opt", "cpu-period=100000", "--driver-opt", "cpu-quota=" + Math.round(policy.cpuLimit * 100000)], 30000, options);
      return await this.run("docker", [...args, workspace], Math.min(profile.timeoutSeconds, policy.timeoutSeconds) * 1000, options);
    } finally {
      options.signal?.removeEventListener("abort", stopBuilder);
      await abortCleanup;
      // Removing this job's builder also stops daemon-side work after a cancelled CLI.
      await this.run("docker", ["buildx", "rm", "--force", builder], 30000).catch(() => undefined);
    }
  }
  async start(image: string, name: string, profile: BuildProfile, policy: DockerExecutionPolicy, options: RunOptions) {
    const args = ["run", "--detach", "--name", name, "--label", "deploypilot.managed=true", "--memory", policy.memoryLimitMb + "m", "--cpus", String(policy.cpuLimit), "--pids-limit", String(policy.pidsLimit), "--cap-drop=ALL", "--security-opt", "no-new-privileges", "--user", "1000:1000", "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--network", "bridge"];
    if (profile.port) args.push("--publish", "127.0.0.1::" + profile.port);
    return this.run("docker", [...args, image, ...(profile.command ?? [])], 30000, options);
  }
  async health(name: string, profile: BuildProfile, options: RunOptions) {
    if (!profile.port || !profile.healthcheckPath) throw new Error("Deployments require a container port and HTTP health-check path. Save a new build profile.");
    const portResult = await this.run("docker", ["port", name, profile.port + "/tcp"], 10000, options);
    const port = portResult.output.trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    if (!port) throw new Error("Docker did not publish a loopback health-check port");
    const origin = "http://127.0.0.1:" + port;
    const url = new URL(profile.healthcheckPath, origin);
    if (url.origin !== origin) throw new Error("Unsafe health-check path");
    for (let attempt = 0; attempt < 30; attempt++) {
      options.signal?.throwIfAborted();
      const state = await this.run("docker", ["inspect", "--format", "{{.State.Running}}", name], 10000, options);
      if (state.output.trim() !== "true") throw new Error("Container exited before its health check passed");
      try {
        const response = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(2000), ...(options.signal ? [options.signal] : [])]), redirect: "manual" });
        await response.body?.cancel();
        if (response.ok) return origin;
      } catch { options.signal?.throwIfAborted(); }
      await delay(1000, undefined, { signal: options.signal });
    }
    throw new Error("Container failed its HTTP health check");
  }
  logs(name: string, onOutput: (line: string) => void) { return this.run("docker", ["logs", "--tail", "100", name], 10000, { onOutput }); }
  async cleanup(name: string, image: string) {
    await this.run("docker", ["rm", "--force", name], 10000).catch(() => undefined);
    await this.run("docker", ["image", "rm", image], 10000).catch(() => undefined);
  }
  private assertSafe(image: string, context: string, policy: DockerExecutionPolicy) {
    if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(image)) throw new Error("Unsafe Docker image name");
    if (context.includes("\0") || context.startsWith("-") || !existsSync(context) || !statSync(context).isDirectory() || !Number.isFinite(policy.memoryLimitMb) || policy.memoryLimitMb < 16 || policy.memoryLimitMb > 4096 || policy.pidsLimit < 1 || policy.pidsLimit > 512 || policy.cpuLimit <= 0 || policy.cpuLimit > 4 || policy.timeoutSeconds < 10 || policy.timeoutSeconds > 3600 || !["none", "bridge"].includes(policy.networkMode)) throw new Error("Unsafe Docker execution policy");
  }
}
