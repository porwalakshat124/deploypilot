import { describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { DockerAdapter } from "./docker-adapter.js";
const workspace = fileURLToPath(new URL("./fixtures/healthy", import.meta.url));
const profile = { strategy: "DOCKERFILE" as const, timeoutSeconds: 60, port: 3000, healthcheckPath: "/health", requiredSecretNames: [] };
const policy = { timeoutSeconds: 60, memoryLimitMb: 512, cpuLimit: 1, pidsLimit: 128, networkMode: "bridge" as const };
describe("Docker command contract", () => {
  it("caps a disposable builder and removes it on build failure", async () => {
    const run = vi.fn().mockResolvedValue({ output: "", code: 0 }).mockResolvedValueOnce({ output: "builder", code: 0 }).mockRejectedValueOnce(new Error("bad Dockerfile"));
    await expect(new DockerAdapter(run).build("safe", workspace, profile, policy)).rejects.toThrow("bad Dockerfile");
    expect(run.mock.calls[0][1]).toEqual(expect.arrayContaining(["docker-container", "memory=512m", "cpu-quota=100000"]));
    expect(run.mock.calls[1][1]).toEqual(expect.arrayContaining(["--load", "--network", "default"]));
    expect(run.mock.calls.at(-1)?.[1]).toEqual(["buildx", "rm", "--force", "safe-builder"]);
  });
  it("starts a non-root container without privileged flags or host mounts", async () => {
    const run = vi.fn().mockResolvedValue({ output: "id", code: 0 });
    await new DockerAdapter(run).start("safe", "deploypilot-safe", profile, policy, {});
    const args = run.mock.calls[0][1] as string[];
    expect(args).toEqual(expect.arrayContaining(["--user", "1000:1000", "--read-only", "--cap-drop=ALL", "--pids-limit", "128", "127.0.0.1::3000"]));
    expect(args).not.toContain("--privileged"); expect(args).not.toContain("--volume");
  });
  it("injects secrets through the local Docker API without CLI arguments",async()=>{
    const run=vi.fn(), engine={call:vi.fn().mockResolvedValue({Id:"container"})};
    await new DockerAdapter(run,engine as never).start("safe","deploypilot-safe",profile,policy,{}, {API_TOKEN:"fixture-secret"});
    expect(run).not.toHaveBeenCalled();
    expect(engine.call.mock.calls[0][2]).toMatchObject({Env:["API_TOKEN=fixture-secret"],User:"1000:1000",HostConfig:{ReadonlyRootfs:true,CapDrop:["ALL"],Memory:512*1048576}});
  });
  it("parses the loopback endpoint for continued health checks",async()=>{
    const run=vi.fn().mockResolvedValue({output:"127.0.0.1:1234\n",code:0});
    expect(await new DockerAdapter(run).runtimeEndpoint("deploypilot-safe",profile)).toBe("http://127.0.0.1:1234");
  });
  it("rejects paths escaping the repository before executing Docker", async () => {
    const run = vi.fn();
    await expect(new DockerAdapter(run).build("safe", workspace, { ...profile, dockerfilePath: "../Dockerfile" }, policy)).rejects.toThrow("Unsafe source path");
    expect(run).not.toHaveBeenCalled();
  });
});
