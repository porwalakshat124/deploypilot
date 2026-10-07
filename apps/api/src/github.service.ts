import { Injectable, InternalServerErrorException, ForbiddenException, BadRequestException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { createAppAuth } from "@octokit/auth-app";
import { readFileSync } from "node:fs";

export type GitHubRepository = {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
};

@Injectable()
export class GitHubService {
  private readonly appId = process.env.GITHUB_APP_ID;
  private readonly privateKey = process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? (process.env.GITHUB_PRIVATE_KEY_PATH ? readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, "utf8") : undefined);

  async personalInstallation(githubUserId: string) {
    if (!/^\d+$/.test(githubUserId)) throw new ForbiddenException("Invalid GitHub identity");
    if (!this.appId || !this.privateKey) throw new ServiceUnavailableException("GitHub App is not configured");
    const jwt = await createAppAuth({ appId: this.appId, privateKey: this.privateKey })({ type: "app" });
    const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${jwt.token}`, "X-GitHub-Api-Version": "2022-11-28" };
    const appResponse = await fetch("https://api.github.com/app", { headers, signal: AbortSignal.timeout(15000) });
    if (!appResponse.ok) throw new ServiceUnavailableException("GitHub App discovery is unavailable");
    const app = await appResponse.json() as { slug?: string };
    if (!app.slug || !/^[a-z0-9-]+$/i.test(app.slug)) throw new ServiceUnavailableException("GitHub App discovery is unavailable");
    const installUrl = `https://github.com/apps/${app.slug}/installations/new`;
    // App-authenticated discovery avoids the shared-IP public account lookup.
    // Return only the installation matching the Supabase-verified durable ID.
    for (let page = 1; page <= 10; page++) {
      const response = await fetch(`https://api.github.com/app/installations?per_page=100&page=${page}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new ServiceUnavailableException(response.status === 403 || response.status === 429 ? "GitHub discovery is rate limited; try again later" : "GitHub installation discovery is unavailable");
      const installations = await response.json() as { id?: number; account?: { id?: number; type?: string; login?: string }; suspended_at?: string | null }[];
      if (!Array.isArray(installations)) throw new ServiceUnavailableException("GitHub installation discovery is unavailable");
      const installation = installations.find(value => value.account?.type === "User" && String(value.account.id) === githubUserId);
      if (installation) {
        if (!Number.isSafeInteger(installation.id) || !installation.account?.login || installation.suspended_at) throw new ForbiddenException("GitHub installation is unavailable");
        return { installationId: String(installation.id), accountLogin: installation.account.login, installUrl };
      }
      if (installations.length < 100) return { installationId: null, accountLogin: "your GitHub account", installUrl };
    }
    throw new ServiceUnavailableException("GitHub installation discovery exceeded its page limit");
  }

  async assertInstallationOwner(installationId: string, githubUserId: string, userToken?: string) {
    if (!/^\d+$/.test(installationId) || !this.appId || !this.privateKey) throw new ForbiddenException("Invalid or unconfigured GitHub installation");
    const auth = createAppAuth({ appId: this.appId, privateKey: this.privateKey });
    const jwt = await auth({ type: "app" });
    const response = await fetch(`https://api.github.com/app/installations/${installationId}`, { headers: { Authorization: `Bearer ${jwt.token}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15000) });
    const installation = await response.json() as { account?: { id: number; type: string; login: string }; suspended_at?: string | null };
    if (!response.ok || !installation.account || installation.suspended_at) throw new ForbiddenException("GitHub installation is unavailable");
    if (installation.account.type === "User" && String(installation.account.id) === githubUserId) return { organization: false, accountLogin: installation.account.login };
    if (installation.account.type !== "Organization" || !userToken || userToken.length > 500) throw new ForbiddenException("Organization installation requires GitHub organization authorization");
    const headers = { Authorization: "Bearer " + userToken, Accept: "application/vnd.github+json" };
    const identityResponse = await fetch("https://api.github.com/user", { headers, signal: AbortSignal.timeout(15000) });
    const identity = await identityResponse.json() as { id?: number };
    if (!identityResponse.ok || String(identity.id) !== githubUserId) throw new ForbiddenException("GitHub token does not match your signed-in account");
    const membershipResponse = await fetch("https://api.github.com/user/memberships/orgs/" + encodeURIComponent(installation.account.login), { headers, signal: AbortSignal.timeout(15000) });
    const membership = await membershipResponse.json() as { role?: string; state?: string };
    if (!membershipResponse.ok || membership.state !== "active" || membership.role !== "admin") throw new ForbiddenException("An active GitHub organization owner must connect this installation; grant read:org access");
    return { organization: true, accountLogin: installation.account.login };
  }

  private async token(installationId: string) {
    if (!this.appId || !this.privateKey) throw new InternalServerErrorException("GitHub App is not configured");
    const auth = createAppAuth({ appId: this.appId, privateKey: this.privateKey });
    const result = await auth({ type: "installation", installationId });
    return result.token;
  }

  private async sourceRequest(installationId: string, fullName: string, suffix: string) {
    const token = await this.token(installationId);
    const response = await fetch(`https://api.github.com/repos/${fullName}/${suffix}`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) throw new NotFoundException("GitHub repository or branch was not found; synchronize repositories and check App access");
    if (!response.ok) throw new ServiceUnavailableException("GitHub source discovery is unavailable; try again later");
    return response;
  }

  async listBranches(installationId: string, fullName: string, page = 1) {
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new BadRequestException("Invalid branch page");
    const response = await this.sourceRequest(installationId, fullName, `branches?per_page=100&page=${page}`);
    const branches = await response.json() as { name: string; commit: { sha: string }; protected: boolean }[];
    return { branches: branches.map(b => ({ name: b.name, sha: b.commit.sha, protected: b.protected })), nextPage: /rel="next"/.test(response.headers.get("link") ?? "") ? page + 1 : null };
  }

  async discoverDockerfiles(installationId: string, fullName: string, branch: string) {
    if (!branch || branch.length > 250 || /[\x00-\x1f\x7f]/.test(branch)) throw new BadRequestException("A valid branch is required");
    const commitResponse = await this.sourceRequest(installationId, fullName, `commits/${encodeURIComponent(branch)}`);
    const commit = await commitResponse.json() as { sha: string; commit: { tree: { sha: string } } };
    const treeResponse = await this.sourceRequest(installationId, fullName, `git/trees/${commit.commit.tree.sha}?recursive=1`);
    const tree = await treeResponse.json() as { tree: { path: string; type: string; mode: string }[]; truncated: boolean };
    const dockerfiles = tree.tree.filter(entry => {
      const name = entry.path.split("/").at(-1) ?? "";
      return entry.type === "blob" && ["100644", "100755"].includes(entry.mode) && /^(Dockerfile(?:\.[^/]+)?|[^/]+\.Dockerfile)$/i.test(name)
        && !entry.path.startsWith("-") && !/[\\:\x00-\x1f\x7f]/.test(entry.path) && !entry.path.split("/").some(part => part === ".." || !part);
    }).map(entry => ({ path: entry.path, dockerContext: "." }));
    dockerfiles.sort((a, b) => Number(b.path === "Dockerfile") - Number(a.path === "Dockerfile") || a.path.localeCompare(b.path));
    return { branch, commitSha: commit.sha, dockerfiles, truncated: Boolean(tree.truncated) };
  }

  async listRepositories(installationId: string): Promise<GitHubRepository[]> {
    const token = await this.token(installationId);
    const repositories: GitHubRepository[] = [];
    for (let page = 1; page <= 100; page++) {
    const response = await fetch("https://api.github.com/installation/repositories?per_page=100&page=" + page, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new ServiceUnavailableException(response.status === 403 || response.status === 429 ? "GitHub repository discovery is rate limited; try again later" : "Unable to read GitHub repositories; check App access and reload");
    const body = await response.json() as { repositories: GitHubRepository[] };
    if (!Array.isArray(body.repositories)) throw new ServiceUnavailableException("GitHub repository discovery returned an invalid list; reload to try again");
    repositories.push(...body.repositories);
    if (!/rel="next"/.test(response.headers.get("link") ?? "")) return repositories;
    }
    throw new ServiceUnavailableException("GitHub repository pagination limit exceeded");
  }

  async resolveCommit(installationId: string, fullName: string, ref: string) {
    const token = await this.token(installationId);
    const response = await fetch(`https://api.github.com/repos/${fullName}/commits/${encodeURIComponent(ref)}`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new InternalServerErrorException("Unable to resolve GitHub commit");
    const body = await response.json() as { sha: string };
    if (!/^[a-f0-9]{40}$/i.test(body.sha)) throw new InternalServerErrorException("GitHub returned an invalid commit SHA");
    return body.sha;
  }

  async downloadArchive(installationId: string, fullName: string, ref: string) {
    const token = await this.token(installationId);
    const response = await fetch(`https://api.github.com/repos/${fullName}/tarball/${encodeURIComponent(ref)}`, {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
      redirect: "follow",
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new InternalServerErrorException("Unable to download the deployment source");
    return response;
  }

  async setCommitStatus(installationId: string, fullName: string, sha: string, state: "pending" | "success" | "failure" | "error", description: string, targetUrl?: string) {
    const token = await this.token(installationId);
    const response = await fetch(`https://api.github.com/repos/${fullName}/statuses/${sha}`, {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
      body: JSON.stringify({ state, context: "DeployPilot", description: description.slice(0, 140), target_url: targetUrl }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new InternalServerErrorException("Unable to publish GitHub commit status");
  }
}
