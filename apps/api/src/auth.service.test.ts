import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), upsert: vi.fn(), limit: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@deploypilot/database/client", () => ({ db: { user: { upsert: mocks.upsert } } }));
vi.mock("./rate-limit.js", () => ({ consumeRateLimit: mocks.limit }));
import { AuthService } from "./auth.service.js";
import type { Request } from "express";
const user = { id: "verified-user", email: "test@example.com", email_confirmed_at: "2026-01-01", identities: [{ provider: "github" }] };
function request(method: string, sub = user.id) { return { headers: { authorization: "Bearer header." + Buffer.from(JSON.stringify({ sub, amr: [{ method }] })).toString("base64url") + ".signature" } } as Request; }
beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user }, error: null }); mocks.limit.mockResolvedValue(true); mocks.upsert.mockResolvedValue({ id: "db-user" }); });
it("accepts a Supabase-validated GitHub OAuth session", async () => { expect(await new AuthService().user(request("oauth"))).toEqual({ id: "db-user" }); expect(mocks.getUser).toHaveBeenCalledOnce(); });
it("rejects password sessions even when GitHub is linked", async () => { await expect(new AuthService().user(request("password"))).rejects.toThrow("GitHub"); expect(mocks.upsert).not.toHaveBeenCalled(); });
it("rejects unvalidated claims before using them", async () => { mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid") }); await expect(new AuthService().user(request("oauth"))).rejects.toThrow(); expect(mocks.limit).not.toHaveBeenCalled(); });
it("rejects a token subject that differs from the verified user", async () => { await expect(new AuthService().user(request("oauth", "other"))).rejects.toThrow("GitHub"); });
it("rejects OAuth identities without GitHub", async () => { mocks.getUser.mockResolvedValue({ data: { user: { ...user, identities: [{ provider: "google" }] } }, error: null }); await expect(new AuthService().user(request("oauth"))).rejects.toThrow("GitHub"); });
