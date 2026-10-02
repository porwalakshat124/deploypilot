import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { OperationsAlerts, OperationsAlertController } from "./operations-alerts.js";
import type { Request } from "express";

describe("operational alerts", () => {
  beforeEach(() => { vi.stubEnv("OPERATIONS_ALERT_TOKEN", "fixture-only"); vi.stubEnv("OPERATIONS_ALERT_EMAIL", "operator@example.invalid"); vi.stubEnv("RESEND_API_KEY", "fixture-key"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.invalid"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("requires the dedicated credential and rejects arbitrary messages", async () => {
    const service = new OperationsAlerts(), send = vi.spyOn(service, "send").mockResolvedValue({ sent: true });
    const controller = new OperationsAlertController(service);
    await expect(controller.storage({headers:{authorization:"Bearer wrong"}} as Request)).rejects.toThrow();
    await expect(controller.notify({ headers: { authorization: "Bearer wrong" } } as Request, { codes: ["MONITOR_TEST"] })).rejects.toThrow();
    await expect(controller.notify({ headers: { authorization: "Bearer fixture-only" } } as Request, { codes: ["arbitrary message"] })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    await controller.notify({ headers: { authorization: "Bearer fixture-only" } } as Request, { codes: ["MONITOR_TEST"] });
    expect(send).toHaveBeenCalledWith(["MONITOR_TEST"]);
  });
  it("uses only the configured recipient and suppresses repeated accepted alerts", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const alerts = new OperationsAlerts();
    expect(await alerts.send(["WORKER_OFFLINE"])).toEqual({ sent: true });
    expect(await alerts.send(["WORKER_OFFLINE"])).toEqual({ sent: false, deduplicated: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body).to).toEqual(["operator@example.invalid"]);
  });
  it("retries provider failures rather than marking them delivered", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true }); vi.stubGlobal("fetch", fetch);
    const alerts = new OperationsAlerts();
    await expect(alerts.send(["WORKER_OFFLINE"])).rejects.toThrow("HTTP 503");
    expect(await alerts.send(["WORKER_OFFLINE"])).toEqual({ sent: true });
  });
  it("rejects plaintext backups and arbitrary storage paths", async () => {
    const controller = new OperationsAlertController(new OperationsAlerts());
    const request = { headers: { authorization: "Bearer fixture-only" } } as Request;
    await expect(controller.backup(request, "a".repeat(64), "database", Buffer.from("plaintext data"))).rejects.toThrow();
    await expect(controller.backup(request, "../other", "database", Buffer.alloc(64))).rejects.toThrow();
    await expect(controller.backup(request, "a".repeat(64), "../other", Buffer.alloc(64))).rejects.toThrow();
  });
});
