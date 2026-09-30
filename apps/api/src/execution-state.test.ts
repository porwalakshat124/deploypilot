import { beforeEach, describe, expect, it, vi } from "vitest";
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn().mockResolvedValue([]),
  deployment: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  deploymentStage: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  deploymentLog: { findFirst: vi.fn().mockResolvedValue({ sequence: 4 }), create: vi.fn().mockResolvedValue({ createdAt: new Date() }) },
  deploymentEvent: { create: vi.fn().mockResolvedValue({}) },
  deploymentEffect: { createMany: vi.fn().mockResolvedValue({ count: 3 }) }
}));
vi.mock("@deploypilot/database/client", () => ({ db: { $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } }));
import { finishDeployment, appendLog } from "./execution-state.js";
beforeEach(() => { vi.clearAllMocks(); tx.deployment.findFirst.mockResolvedValue({ status: "RUNNING", stages: ["docker-build", "health-check", "deploy"].map(name => ({ name, status: "SUCCEEDED" })) }); });
describe("worker terminal state", () => {
  it("refuses success after cancellation", async () => {
    tx.deployment.findFirst.mockResolvedValue({ status: "CANCELLED", stages: [] });
    await expect(finishDeployment("d", "w", "SUCCEEDED", "done")).rejects.toThrow("no longer running");
    expect(tx.deployment.update).not.toHaveBeenCalled();
  });
  it("requires successful health-check and deploy stages", async () => {
    tx.deployment.findFirst.mockResolvedValue({ status: "RUNNING", stages: [{ name: "docker-build", status: "SUCCEEDED" }] });
    await expect(finishDeployment("d", "w", "SUCCEEDED", "done")).rejects.toThrow("Required stages");
  });
  it("persists final evidence before setting the terminal state", async () => {
    await finishDeployment("d", "w", "SUCCEEDED", "done");
    expect(tx.deploymentEvent.create.mock.invocationCallOrder.at(-1)!).toBeLessThan(tx.deployment.update.mock.invocationCallOrder[0]);
  });
  it("allows retry of an acknowledged completion without duplicating events", async () => {
    tx.deployment.findFirst.mockResolvedValue({ status: "SUCCEEDED", stages: [] });
    await expect(finishDeployment("d", "w", "SUCCEEDED", "done")).resolves.toEqual({ deploymentId: "d", status: "SUCCEEDED" });
    expect(tx.deploymentEvent.create).not.toHaveBeenCalled();
  });
  it("redacts before durable log storage and allocates the next sequence", async () => {
    await appendLog("d", "docker-build", "info", "TOKEN=abc");
    expect(tx.deploymentLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ sequence: 5, message: "TOKEN=[REDACTED]" }) });
  });
});
