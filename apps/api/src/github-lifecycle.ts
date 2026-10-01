import { cancelPending } from "./cancel-pending.js";
import type { Prisma } from "@prisma/client";
export type LifecyclePayload = { action?: string; installation?: { id: number }; repositories_removed?: { id: number }[]; repository?: { id: number; full_name?: string; default_branch?: string } };
export async function githubLifecycle(tx: Prisma.TransactionClient, event: string, payload: LifecyclePayload) {
  const installationId = payload.installation?.id ? String(payload.installation.id) : undefined;
  if (event === "installation" && installationId) {
    if (payload.action === "deleted" || payload.action === "suspend") {
      const installation = await tx.gitHubInstallation.findUnique({ where: { installationId } });
      if (installation) {
        await tx.gitHubInstallation.update({ where: { id: installation.id }, data: payload.action === "deleted" ? { revokedAt: new Date() } : { suspendedAt: new Date() } });
        await tx.repository.updateMany({ where: { installationId: installation.id }, data: { archivedAt: new Date() } });
        await cancelPending(tx, { repository: { installationId: installation.id } }, "GitHub installation access withdrawn");
      }
    } else if (payload.action === "unsuspend") await tx.gitHubInstallation.updateMany({ where: { installationId }, data: { suspendedAt: null } });
    return "installation." + payload.action;
  }
  if (event === "installation_repositories" && installationId) {
    const ids = payload.repositories_removed?.map(repo => String(repo.id)) ?? [];
    await tx.repository.updateMany({ where: { githubRepoId: { in: ids }, installation: { installationId } }, data: { archivedAt: new Date() } });
    return "installation.repositories-changed";
  }
  if (event === "repository" && payload.repository?.id) {
    const repo = payload.repository;
    if (payload.action === "deleted" || payload.action === "transferred") {
      await tx.repository.updateMany({ where: { githubRepoId: String(repo.id) }, data: { archivedAt: new Date() } });
    } else if (repo.full_name && repo.default_branch && ["renamed", "edited"].includes(payload.action ?? "")) {
      await tx.repository.updateMany({ where: { githubRepoId: String(repo.id) }, data: { fullName: repo.full_name, defaultBranch: repo.default_branch } });
    }
    return "repository." + payload.action;
  }
  return "ignored-event";
}
