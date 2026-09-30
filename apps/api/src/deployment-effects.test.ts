import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ deploymentEffect: { updateMany: vi.fn(), findMany: vi.fn(), update: vi.fn() }, deployment: { findUniqueOrThrow: vi.fn() }, deploymentLog: { findMany: vi.fn() } }));
vi.mock("@deploypilot/database/client", () => ({ db }));
vi.mock("./r2.service.js", () => ({ r2: { configured: () => false } }));
import { DeploymentEffectsService } from "./deployment-effects.service.js";
const notify = { deploymentResult: vi.fn() };
const service = new DeploymentEffectsService({} as never, notify as never);
beforeEach(() => {
  vi.clearAllMocks();
  db.deploymentEffect.updateMany.mockResolvedValue({ count: 1 });
  db.deploymentEffect.findMany.mockResolvedValue([{ id: "effect", deploymentId: "run", kind: "email", attempts: 0 }]);
  db.deployment.findUniqueOrThrow.mockResolvedValue({ id: "run", status: "SUCCEEDED", repository: {} });
});
describe("durable provider delivery", () => {
  it("does not send an effect claimed by another API instance", async () => {
    db.deploymentEffect.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
    await service.process();
    expect(notify.deploymentResult).not.toHaveBeenCalled();
  });
  it("retries provider failures without changing deployment success", async () => {
    notify.deploymentResult.mockRejectedValue(new Error("provider unavailable"));
    await service.process();
    expect(db.deploymentEffect.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", lastError: "provider unavailable" }) }));
    expect(db.deployment.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });
  it("records an unconfigured notification as skipped", async () => {
    notify.deploymentResult.mockResolvedValue({ sent: false });
    await service.process();
    expect(db.deploymentEffect.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SKIPPED" }) }));
  });
});
