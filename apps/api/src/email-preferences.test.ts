import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ user: { update: vi.fn() }, deployment: { findUnique: vi.fn() } }));
vi.mock("@deploypilot/database/client", () => ({ db }));
import { TeamsController } from "./teams.controller.js";
import { NotificationsService } from "./notifications.service.js";

describe("email preferences", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const request = {} as never;
  const controller = new TeamsController({ user: vi.fn().mockResolvedValue({ id: "current-user" }) } as never);
  it("lets an authenticated user unsubscribe without supplying a display name", async () => {
    db.user.update.mockResolvedValue({ emailNotifications: "OFF" });
    await controller.updateMe(request, { emailNotifications: "OFF" });
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "current-user" }, data: { emailNotifications: "OFF" } }));
  });
  it.each(["INVALID", null, ["OFF"], 0])("rejects invalid preferences: %s", async emailNotifications => {
    await expect(controller.updateMe(request, { emailNotifications })).rejects.toThrow("Invalid notification preference");
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("does not reset unsubscribe when saving a display name", async () => {
    await controller.updateMe(request, { displayName: "Test User" });
    expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { displayName: "Test User" } }));
  });
  it("rejects empty updates", async () => {
    await expect(controller.updateMe(request, {})).rejects.toThrow("Choose an account setting");
  });
  it.each([false, true])("suppresses deployment emails for an unsubscribed personal or team owner (%s)", async team => {
    vi.stubEnv("RESEND_API_KEY", "fixture"); vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.invalid");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const user = { email: "owner@example.invalid", emailNotifications: "OFF" };
    db.deployment.findUnique.mockResolvedValue({ repository: { owner: user, teamId: team ? "team" : null, team: { members: [{ user }] } } });
    try {
      expect(await new NotificationsService().deploymentResult("deployment", "FAILED")).toEqual({ sent: false, reason: "Disabled by recipient preferences" });
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });
});
