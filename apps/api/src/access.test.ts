import { describe, expect, it, vi, beforeEach } from "vitest";
import { repositoryAccess } from "./access.js";
import type { Request } from "express";
const db = vi.hoisted(() => ({
  teamMember: { findUnique: vi.fn(), upsert: vi.fn() },
  teamInvite: { findUnique: vi.fn(), updateMany: vi.fn() },
  teamAudit: { create: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn()
}));
vi.mock("@deploypilot/database/client", () => ({ db }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: {} }) }));
import { TeamsController, assignableRole, canManageRole, inviteEmail, inviteHash } from "./teams.controller.js";
const user = { id: "viewer", email: "viewer@example.com" };
const controller = new TeamsController({ user: vi.fn().mockResolvedValue(user) } as never);
const request = { headers: {} } as Request;
beforeEach(() => { vi.clearAllMocks(); db.$transaction.mockImplementation(fn => fn(db)); });

describe("tenant permissions", () => {
  it("never grants personal ownership access to a team repository", () => {
    expect(repositoryAccess("former-owner").OR?.[0]).toEqual({ teamId: null, ownerId: "former-owner" });
  });
  it("uses live membership and excludes viewers from deployment mutations", () => {
    expect(repositoryAccess("u", "deploy").OR?.[1]).toEqual({ team: { members: { some: { userId: "u", role: { in: ["OWNER", "ADMIN", "DEVELOPER"] } } } } });
    expect(JSON.stringify(repositoryAccess("u", "admin"))).not.toContain("DEVELOPER");
    expect(JSON.stringify(repositoryAccess("u"))).toContain("VIEWER");
  });
  it("cannot issue an owner invitation or elevate an administrator's peer", () => {
    expect(() => assignableRole("OWNER")).toThrow();
    expect(() => assignableRole({ role: "ADMIN" })).toThrow();
    expect(canManageRole("ADMIN", "ADMIN")).toBe(false);
    expect(canManageRole("DEVELOPER", "VIEWER")).toBe(false);
    expect(canManageRole("OWNER", "OWNER")).toBe(false);
    expect(canManageRole("OWNER", "ADMIN")).toBe(true);
  });
  it("normalizes email and rejects malformed invitation addresses", () => {
    expect(inviteEmail(" User@Example.com ")).toBe("user@example.com");
    expect(() => inviteEmail("user @example.com")).toThrow();
    expect(() => inviteEmail(null)).toThrow();
  });
  it("stores a one-way digest instead of the invitation bearer token", () => {
    const token = "x".repeat(43);
    expect(inviteHash(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(inviteHash(token)).not.toContain(token);
  });
  it("denies invitation creation to a viewer before writing", async () => {
    db.teamMember.findUnique.mockResolvedValue({ role: "VIEWER" });
    await expect(controller.invite(request, "team", { email: "other@example.com", role: "VIEWER" })).rejects.toThrow("administrator");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects a token issued to another email", async () => {
    db.teamInvite.findUnique.mockResolvedValue({ email: "someone@example.com", expiresAt: new Date(Date.now() + 60000), usedAt: null });
    await expect(controller.accept(request, { token: "a".repeat(43) })).rejects.toThrow("email address");
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });
  it("rejects an expired token", async () => {
    db.teamInvite.findUnique.mockResolvedValue({ email: user.email, expiresAt: new Date(0), usedAt: null });
    await expect(controller.accept(request, { token: "a".repeat(43) })).rejects.toThrow("expired");
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });
  it("rejects the losing request when two requests redeem one token", async () => {
    db.teamInvite.findUnique.mockResolvedValue({ id: "invite", email: user.email, expiresAt: new Date(Date.now() + 60000), usedAt: null });
    db.teamInvite.updateMany.mockResolvedValue({ count: 0 });
    await expect(controller.accept(request, { token: "a".repeat(43) })).rejects.toThrow("already been used");
    expect(db.teamMember.upsert).not.toHaveBeenCalled();
  });
  it("does not elevate existing members when accepting an old invitation", async () => {
    db.teamInvite.findUnique.mockResolvedValue({ id: "invite", teamId: "team", role: "ADMIN", email: user.email, expiresAt: new Date(Date.now() + 60000), usedAt: null });
    db.teamInvite.updateMany.mockResolvedValue({ count: 1 });
    await controller.accept(request, { token: "a".repeat(43) });
    expect(db.teamMember.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  });
});
