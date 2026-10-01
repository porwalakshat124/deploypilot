import { describe, it, expect, vi } from "vitest";
import { DeploymentExecutor } from "./deployment-executor.js";
import type { DockerAdapter } from "./docker-adapter.js";
import type { WorkerApi } from "./worker-api.js";
const job = { deploymentId: "f4c843df-fb99-4f77-a49a-0945ad0c9f05", commitSha: "a".repeat(40), profile: { strategy: "DOCKERFILE" as const, timeoutSeconds: 60, port: 3000, healthcheckPath: "/", requiredSecretNames: [] } };
function fixture() {
  const api = { log: vi.fn().mockResolvedValue({}), logs: vi.fn().mockResolvedValue({}), stage: vi.fn().mockResolvedValue({}), complete: vi.fn().mockResolvedValue({}), status: vi.fn().mockResolvedValue({ status: "RUNNING" }), downloadSource: vi.fn().mockResolvedValue(Buffer.from("archive")) };
  const docker = { imageId: vi.fn().mockResolvedValue("sha256:"+"b".repeat(64)), build: vi.fn().mockResolvedValue({}), start: vi.fn().mockResolvedValue({}), health: vi.fn().mockResolvedValue("http://127.0.0.1:1234"), logs: vi.fn().mockResolvedValue({}), cleanup: vi.fn().mockResolvedValue(undefined) };
  const source = vi.fn(async (_: Buffer, run: (path: string) => Promise<void>) => run("checkout"));
  const executor = new DeploymentExecutor(docker as unknown as DockerAdapter, source);
  return { api, docker, source, executor, run: () => executor.execute(job, api as unknown as WorkerApi) };
}
describe("remote execution", () => {
  it("delivers verbose Docker output in bounded ordered batches before completion", async () => {
    const f = fixture();
    f.docker.build.mockImplementation(async (_i, _w, _p, _policy, options) => { for (let i = 0; i < 125; i++) options.onOutput("line " + i); });
    expect(await f.run()).toEqual({ status: "SUCCEEDED" });
    const batches = f.api.logs.mock.calls.map(call => call[1]);
    expect(batches.map(batch => batch.length)).toEqual([50, 50, 25]);
    expect(batches.flat().map(entry => entry.message)).toEqual(Array.from({ length: 125 }, (_, i) => "line " + i));
    expect(f.api.logs.mock.invocationCallOrder.at(-1)!).toBeLessThan(f.api.complete.mock.invocationCallOrder[0]);
  });
  it("completes only after image, container, and HTTP health succeed", async () => {
    const f = fixture(); expect(await f.run()).toEqual({ status: "SUCCEEDED" });
    expect(f.docker.start).toHaveBeenCalledOnce(); expect(f.docker.health).toHaveBeenCalledOnce();
    expect(f.api.stage).toHaveBeenCalledWith(job.deploymentId, "tests", "SKIPPED", expect.any(String));
    expect(f.api.complete).toHaveBeenCalledWith(job.deploymentId, "SUCCEEDED", expect.any(String), "http://127.0.0.1:1234", "sha256:"+"b".repeat(64));
    expect(f.docker.cleanup).not.toHaveBeenCalled();
  });
  it("records the failed build stage and never runs health after a build error", async () => {
    const f = fixture(); f.docker.build.mockRejectedValue(new Error("Broken Dockerfile"));
    expect(await f.run()).toEqual({ status: "FAILED" });
    expect(f.api.stage).toHaveBeenCalledWith(job.deploymentId, "docker-build", "FAILED", "Broken Dockerfile");
    expect(f.docker.health).not.toHaveBeenCalled(); expect(f.docker.cleanup).toHaveBeenCalledOnce();
  });
  it("does not turn a failed health check into success", async () => {
    const f = fixture(); f.docker.health.mockRejectedValue(new Error("Unhealthy"));
    expect(await f.run()).toEqual({ status: "FAILED" });
    expect(f.api.stage).toHaveBeenCalledWith(job.deploymentId, "health-check", "FAILED", "Unhealthy");
    expect(f.docker.cleanup).toHaveBeenCalledOnce();
  });
  it("honors cancellation before starting and does not overwrite the API terminal status", async () => {
    const f = fixture(); f.api.status.mockResolvedValue({ status: "CANCELLED" });
    expect(await f.run()).toEqual({ status: "CANCELLED" });
    expect(f.docker.build).not.toHaveBeenCalled(); expect(f.api.complete).not.toHaveBeenCalled();
  });
  it("stops a running build when cancellation is polled", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      f.api.status.mockResolvedValueOnce({ status: "RUNNING" }).mockResolvedValue({ status: "CANCELLED" });
      f.docker.build.mockImplementation((_i, _w, _p, _policy, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason))));
      const result = f.run(); await vi.advanceTimersByTimeAsync(2100);
      expect(await result).toEqual({ status: "CANCELLED" }); expect(f.docker.cleanup).toHaveBeenCalledOnce(); expect(f.api.complete).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("times out execution and marks it TIMED_OUT", async () => {
    const f = fixture(); f.docker.build.mockRejectedValue(new Error("Execution timed out"));
    expect(await f.run()).toEqual({ status: "TIMED_OUT" });
    expect(f.api.complete).toHaveBeenCalledWith(job.deploymentId, "TIMED_OUT", expect.any(String));
  });
  it("rolls back with the recorded image without downloading or rebuilding source", async () => {
    const f = fixture(), imageId = "sha256:"+"c".repeat(64);
    expect(await f.executor.execute({...job,reuseImageId:imageId}, f.api as unknown as WorkerApi)).toEqual({status:"SUCCEEDED"});
    expect(f.api.downloadSource).not.toHaveBeenCalled();
    expect(f.docker.build).not.toHaveBeenCalled();
    expect(f.docker.start.mock.calls[0][0]).toBe(imageId);
  });
  it("guards duplicate in-process execution", async () => {
    const f = fixture(); const first = f.run();
    expect(await f.run()).toEqual({ status: "DUPLICATE" });
    await first; expect(f.docker.build).toHaveBeenCalledOnce();
  });
});
