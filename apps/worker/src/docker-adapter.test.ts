import { describe, expect, it } from "vitest";
import { DockerAdapter } from "./docker-adapter.js";

describe("DockerAdapter safety boundary", () => {
  const adapter = new DockerAdapter();
  const profile = { strategy: "DOCKERFILE" as const, timeoutSeconds: 60, requiredSecretNames: [] };
  const policy = { timeoutSeconds: 60, memoryLimitMb: 512, cpuLimit: 1, pidsLimit: 128, networkMode: "none" as const };

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
