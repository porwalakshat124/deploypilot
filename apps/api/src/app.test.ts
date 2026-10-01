import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";
const db = vi.hoisted(() => ({
  repository: { findMany: vi.fn(), findFirst: vi.fn() },
  deployment: { create: vi.fn(), findFirst: vi.fn() },
  worker: { findUnique: vi.fn() }
}));
vi.mock("@deploypilot/database/client", () => ({ db }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { getUser: vi.fn() } }) }));
import { AppController } from "./app.js";
import { repositoryAccess } from "./access.js";
const user = { id: "owner" };
const auth = { user: vi.fn().mockResolvedValue(user) };
const github = { resolveCommit: vi.fn().mockResolvedValue("a".repeat(40)), listBranches: vi.fn(), discoverDockerfiles: vi.fn() };
const controller = new AppController(auth as never, github as never, {} as never, {} as never);
const request = { headers: {} } as Request;
const discoveryRequest = (query: Record<string, unknown>) => ({ headers: {}, query }) as unknown as Request;
const profile = { strategy: "DOCKERFILE", timeoutSeconds: 900, port: 3000, healthcheckPath: "/" };
const repository = () => ({ id: "repo", defaultBranch: "main", installation: { installationId: "123" }, fullName: "owner/repo", configs: [{ id: "config", branchRule: "main", profile }], environments: [{ id: "env" }], workers: [{ id: "worker", revokedAt: null }] });
beforeEach(() => { vi.clearAllMocks(); db.repository.findFirst.mockResolvedValue(repository()); db.deployment.create.mockResolvedValue({ id: "deployment", status: "QUEUED", commitSha: "a".repeat(40) }); });
describe("repository and execution authorization", () => {
  it("scopes repository lists to the verified user", async () => {
    db.repository.findMany.mockResolvedValue([]);
    await controller.listRepositories(request);
    expect(db.repository.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: repositoryAccess("owner") }));
  });
  it("does not accept a worker from another repository", async () => {
    await expect(controller.createDeployment(request, "repo", { configId: "config", environmentId: "env", workerId: "other-worker", branch: "main" })).rejects.toThrow("Worker does not belong");
    expect(db.deployment.create).not.toHaveBeenCalled();
  });
  it("does not accept a foreign environment or configuration", async () => {
    await expect(controller.createDeployment(request, "repo", { configId: "config", environmentId: "foreign", workerId: "worker", branch: "main" })).rejects.toThrow("does not belong");
  });
  it("pins branch deployments to a resolved SHA before storing them", async () => {
    await controller.createDeployment(request, "repo", { configId: "config", environmentId: "env", workerId: "worker", branch: "main" });
    expect(github.resolveCommit).toHaveBeenCalledWith("123", "owner/repo", "main");
    expect(db.deployment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ commitSha: "a".repeat(40) }) }));
  });
  it("rejects unauthorized repositories before contacting GitHub", async () => {
    db.repository.findFirst.mockResolvedValue(null);
    await expect(controller.createDeployment(request, "foreign", { configId: "config", environmentId: "env", workerId: "worker", branch: "main" })).rejects.toThrow("Repository not found");
    expect(github.resolveCommit).not.toHaveBeenCalled();
  });
  it("rejects worker requests without a matching credential", async () => {
    db.worker.findUnique.mockResolvedValue(null);
    await expect(controller.workerStatus(request, "worker", "deployment")).rejects.toThrow();
    expect(db.deployment.findFirst).not.toHaveBeenCalled();
  });
  it("scopes branch and Dockerfile discovery to the repository owner", async () => {
    db.repository.findFirst.mockResolvedValue(null);
    await expect(controller.repositoryBranches(discoveryRequest({}), "foreign")).rejects.toThrow("Repository not found");
    await expect(controller.repositoryDockerfiles(discoveryRequest({}), "foreign")).rejects.toThrow("Repository not found");
    expect(github.listBranches).not.toHaveBeenCalled(); expect(github.discoverDockerfiles).not.toHaveBeenCalled();
  });
  it("uses the default branch and installation of the owned repository", async () => {
    await controller.repositoryDockerfiles(discoveryRequest({}), "repo");
    expect(github.discoverDockerfiles).toHaveBeenCalledWith("123", "owner/repo", "main");
    await controller.repositoryBranches(discoveryRequest({ page: "2" }), "repo");
    expect(github.listBranches).toHaveBeenCalledWith("123", "owner/repo", 2);
  });
  it("rejects malformed discovery query parameters", async () => {
    await expect(controller.repositoryBranches(discoveryRequest({ page: "1&evil=1" }), "repo")).rejects.toThrow("Invalid branch page");
    await expect(controller.repositoryDockerfiles(discoveryRequest({ branch: ["main", "other"] }), "repo")).rejects.toThrow("valid branch");
    expect(github.listBranches).not.toHaveBeenCalled(); expect(github.discoverDockerfiles).not.toHaveBeenCalled();
  });
});
