import { Injectable, InternalServerErrorException, ForbiddenException } from "@nestjs/common";
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

  async assertInstallationOwner(installationId: string, githubUserId: string) {
    if (!/^\d+$/.test(installationId) || !this.appId || !this.privateKey) throw new ForbiddenException("Invalid or unconfigured GitHub installation");
    const auth = createAppAuth({ appId: this.appId, privateKey: this.privateKey });
    const jwt = await auth({ type: "app" });
    const response = await fetch(`https://api.github.com/app/installations/${installationId}`, { headers: { Authorization: `Bearer ${jwt.token}`, Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15000) });
    const installation = await response.json() as { account?: { id: number; type: string } };
    if (!response.ok || installation.account?.type !== "User" || String(installation.account.id) !== githubUserId) throw new ForbiddenException("Only installations owned by your GitHub account can be connected; organization installation authorization is not configured");
  }

  private async token(installationId: string) {
    if (!this.appId || !this.privateKey) throw new InternalServerErrorException("GitHub App is not configured");
    const auth = createAppAuth({ appId: this.appId, privateKey: this.privateKey });
    const result = await auth({ type: "installation", installationId });
    return result.token;
  }

  async listRepositories(installationId: string): Promise<GitHubRepository[]> {
    const token = await this.token(installationId);
    const response = await fetch("https://api.github.com/installation/repositories?per_page=100", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new InternalServerErrorException("Unable to read GitHub repositories");
    const body = await response.json() as { repositories: GitHubRepository[] };
    return body.repositories;
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
