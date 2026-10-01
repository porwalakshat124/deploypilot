import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const authenticate = vi.hoisted(() => vi.fn().mockResolvedValue({ token: "test-token" }));
vi.mock("@octokit/auth-app", () => ({ createAppAuth: () => authenticate }));
import { GitHubService } from "./github.service.js";
const fetchMock = vi.fn();
let github: GitHubService;
beforeEach(() => {
  vi.stubEnv("GITHUB_APP_ID", "123"); vi.stubEnv("GITHUB_PRIVATE_KEY", "test-only");
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); github = new GitHubService();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function json(value: unknown, headers?: Record<string, string>) { return new Response(JSON.stringify(value), { headers }); }
function commit() { fetchMock.mockResolvedValueOnce(json({ sha: "a".repeat(40), commit: { tree: { sha: "b".repeat(40) } } })); }
describe("GitHub source discovery", () => {
  it("connects organizations only after verifying GitHub identity and active owner membership",async()=>{
    fetchMock.mockResolvedValueOnce(json({account:{id:10,type:"Organization",login:"org"}})).mockResolvedValueOnce(json({id:99})).mockResolvedValueOnce(json({role:"admin",state:"active"}));
    expect(await github.assertInstallationOwner("42","99","provider-token")).toEqual({organization:true,accountLogin:"org"});
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.github.com/user/memberships/orgs/org");
  });
  it("rejects a provider token belonging to a different signed-in identity",async()=>{
    fetchMock.mockResolvedValueOnce(json({account:{id:10,type:"Organization",login:"org"}})).mockResolvedValueOnce(json({id:101}));
    await expect(github.assertInstallationOwner("42","99","provider-token")).rejects.toThrow("match");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("paginates branches and returns names, commits and protection", async () => {
    fetchMock.mockResolvedValueOnce(json([{ name: "feature/docker", commit: { sha: "a".repeat(40) }, protected: true }], { link: '<https://api.github.com/repos/owner/repo/branches?page=3>; rel="next"' }));
    expect(await github.listBranches("42", "owner/repo", 2)).toEqual({ branches: [{ name: "feature/docker", sha: "a".repeat(40), protected: true }], nextPage: 3 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/owner/repo/branches?per_page=100&page=2");
  });
  it("rejects invalid pagination before calling GitHub", async () => {
    await expect(github.listBranches("42", "owner/repo", 0)).rejects.toThrow("Invalid branch page");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("scans a fixed tree, finds nested/variant Dockerfiles and excludes symlinks and unsafe paths", async () => {
    commit();
    const entry = (path: string, mode = "100644", type = "blob") => ({ path, mode, type });
    fetchMock.mockResolvedValueOnce(json({ tree: [entry("apps/api/Dockerfile"), entry("Dockerfile.prod"), entry("Dockerfile"), entry("worker.Dockerfile"), entry("Dockerfile.link", "120000"), entry("../Dockerfile"), entry("evil:Dockerfile"), entry("README.md"), entry("Dockerfile", "040000", "tree")], truncated: false }));
    const result = await github.discoverDockerfiles("42", "owner/repo", "feature/docker");
    expect(result.commitSha).toBe("a".repeat(40));
    expect(result.dockerfiles.map(f => f.path)).toEqual(["Dockerfile", "apps/api/Dockerfile", "Dockerfile.prod", "worker.Dockerfile"]);
    expect(result.dockerfiles.every(f => f.dockerContext === ".")).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/repos/owner/repo/commits/feature%2Fdocker");
    expect(fetchMock.mock.calls[1][0]).toBe(`https://api.github.com/repos/owner/repo/git/trees/${"b".repeat(40)}?recursive=1`);
  });
  it("reports an incomplete tree instead of claiming there are no Dockerfiles", async () => {
    commit(); fetchMock.mockResolvedValueOnce(json({ tree: [], truncated: true }));
    expect(await github.discoverDockerfiles("42", "owner/repo", "main")).toMatchObject({ dockerfiles: [], truncated: true });
  });
  it("distinguishes a missing branch and hides provider errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("private provider details", { status: 404 }));
    await expect(github.discoverDockerfiles("42", "owner/repo", "deleted")).rejects.toThrow("was not found");
    fetchMock.mockResolvedValueOnce(new Response("private provider details", { status: 403 }));
    await expect(github.listBranches("42", "owner/repo")).rejects.toThrow("try again later");
  });
});
