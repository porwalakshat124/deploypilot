import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DockerAdapter } from "./docker-adapter.js";
describe.skipIf(process.env.DOCKER_SMOKE !== "1")("real Docker worker smoke", () => {
  it("builds in bounded BuildKit, starts a restricted container, and checks health", async () => {
    const docker = new DockerAdapter();
    const name = "deploypilot-smoke-" + randomUUID();
    const profile = { strategy: "DOCKERFILE" as const, timeoutSeconds: 180, port: 3000, healthcheckPath: "/health", requiredSecretNames: [] };
    const policy = { timeoutSeconds: 180, memoryLimitMb: 512, cpuLimit: 1, pidsLimit: 128, networkMode: "bridge" as const };
    try {
      await docker.build(name, fileURLToPath(new URL("./fixtures/healthy", import.meta.url)), profile, policy);
      await docker.start(name, name, profile, policy, {});
      expect(await docker.health(name, profile, {})).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    } finally { await docker.cleanup(name, name); }
  }, 240000);
});
