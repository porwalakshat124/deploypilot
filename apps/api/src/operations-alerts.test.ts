import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { OperationsAlerts, OperationsAlertController } from "./operations-alerts.js";
import type { Request } from "express";
const db = vi.hoisted(() => ({ user: { findFirst: vi.fn() } }));
vi.mock("@deploypilot/database/client", () => ({ db }));

describe("operational alerts", () => {
  beforeEach(() => { vi.stubEnv("OPERATIONS_ALERT_TOKEN", "fixture-only"); vi.stubEnv("OPERATIONS_ALERT_EMAIL", "operator@example.invalid"); vi.stubEnv("RESEND_API_KEY", "fixture-key"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.invalid"); });
  beforeEach(() => { db.user.findFirst.mockReset().mockResolvedValue({ emailNotifications: "ALL" }); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("honors unsubscribe before contacting the email provider", async () => {
    db.user.findFirst.mockResolvedValue({ emailNotifications: "OFF" });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await new OperationsAlerts().send(["WORKER_OFFLINE"])).toEqual({ sent: false, reason: "Disabled by recipient preferences" });
    expect(fetch).not.toHaveBeenCalled();
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: { email: { equals: "operator@example.invalid", mode: "insensitive" } }, select: { emailNotifications: true } });
  });
  it("does not send when preferences cannot be checked", async () => {
    db.user.findFirst.mockRejectedValue(new Error("database unavailable"));
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(new OperationsAlerts().send(["DATABASE_UNAVAILABLE"])).rejects.toThrow("database unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("checks the current preference again after resubscribing", async () => {
    db.user.findFirst.mockResolvedValueOnce({ emailNotifications: "OFF" }).mockResolvedValueOnce({ emailNotifications: "FAILURES" });
    const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", fetch);
    const alerts = new OperationsAlerts();
    expect((await alerts.send(["WORKER_OFFLINE"])).sent).toBe(false);
    expect((await alerts.send(["WORKER_OFFLINE"])).sent).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
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
