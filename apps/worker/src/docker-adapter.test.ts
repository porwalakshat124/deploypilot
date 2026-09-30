import { describe, expect, it, vi } from "vitest";
import type { Runner } from "./process-runner.js";
import { DockerAdapter } from "./docker-adapter.js";

describe("DockerAdapter safety boundary", () => {
  const adapter = new DockerAdapter();
  const profile = { strategy: "DOCKERFILE" as const, timeoutSeconds: 60, requiredSecretNames: [] };
  const policy = { timeoutSeconds: 60, memoryLimitMb: 512, cpuLimit: 1, pidsLimit: 128, networkMode: "none" as const };

  it("force-stops only this job's daemon builder when execution is aborted", async () => {
    const abort = new AbortController();
    const calls: string[][] = [];
    const run: Runner = vi.fn(async (_command, args) => {
      calls.push(args);
      if (args[0] === "buildx" && args[1] === "build") {
        abort.abort(new Error("Cancelled"));
        throw abort.signal.reason;
      }
      return { code: 0, output: "" };
    });
    await expect(new DockerAdapter(run).build("deploypilot-test", "src/fixtures/healthy", { ...profile, dockerfilePath: "Dockerfile" }, policy, { signal: abort.signal })).rejects.toThrow("Cancelled");
    expect(calls).toContainEqual(["rm", "--force", "buildx_buildkit_deploypilot-test-builder0"]);
    expect(calls.at(-1)).toEqual(["buildx", "rm", "--force", "deploypilot-test-builder"]);
  });

  it("rejects shell-like image names", async () => {
    await expect(adapter.build("bad;rm -rf /", ".", profile, policy)).rejects.toThrow("Unsafe Docker image name");
  });

  it("rejects option-like build contexts", async () => {
    await expect(adapter.build("safe-image", "--privileged", profile, policy)).rejects.toThrow("Unsafe Docker execution policy");
  });

  it("rejects excessive memory and process limits", async () => {
    await expect(adapter.build("safe-image", ".", profile, { ...policy, memoryLimitMb: 8192 })).rejects.toThrow("Unsafe Docker execution policy");
    await expect(adapter.build("safe-image", ".", profile, { ...policy, pidsLimit: 1024 })).rejects.toThrow("Unsafe Docker execution policy");
  });
});
