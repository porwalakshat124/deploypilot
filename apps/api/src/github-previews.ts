import type { Prisma } from "@prisma/client";
import { assertEnvironmentTarget } from "./environment-policy.js";
import { workerIsActive } from "./worker-auth.js";
import { cancelPending } from "./cancel-pending.js";
export type PreviewPayload = { action?: string; number?: number; repository?: { id: number }; installation?: { id: number }; pull_request?: { head: { sha: string; ref: string; repo?: { id: number } | null } } };
export async function githubPreview(tx: Prisma.TransactionClient, payload: PreviewPayload) {
  const pr = payload.pull_request;
  if (!pr || !Number.isSafeInteger(payload.number) || payload.number! < 1 || !payload.repository?.id || !payload.installation?.id) return "ignored-invalid-preview";
  const repo = await tx.repository.findFirst({ where: { githubRepoId: String(payload.repository.id), installation: { installationId: String(payload.installation.id), revokedAt: null, suspendedAt: null } }, include: { configs: { orderBy: { version: "desc" } }, workers: { orderBy: { createdAt: "asc" } }, team: true } });
  if (!repo || repo.archivedAt || repo.team?.archivedAt) return "ignored-unavailable-repository";
  if (payload.action === "closed") {
    await cancelPending(tx, { repositoryId: repo.id, previewNumber: payload.number }, "Pull request closed", true);
    const runtimes = await tx.deploymentRuntime.findMany({ where: { deployment: { repositoryId: repo.id, previewNumber: payload.number }, state: { notIn: ["STOPPED", "MISSING"] } } });
    for (const runtime of runtimes) {
      if (!await tx.runtimeCommand.findFirst({ where: { runtimeId: runtime.id, status: { in: ["PENDING", "RUNNING"] } } })) {
        await tx.runtimeCommand.create({ data: { runtimeId: runtime.id, action: "STOP", actorId: "github:pr-closed" } });
        await tx.deploymentRuntime.update({ where: { id: runtime.id }, data: { desiredState: "STOPPED" } });
      }
    }
    return "preview.closed";
  }
  if (!repo.previewEnabled || !["opened", "synchronize", "reopened"].includes(payload.action ?? "")) return "ignored-preview-disabled";
  if (pr.head.repo?.id !== payload.repository.id) return "ignored-fork-preview";
  if (!/^[a-f0-9]{40}$/.test(pr.head.sha) || !pr.head.ref || pr.head.ref.length > 250) return "ignored-invalid-preview";
  const config = repo.configs.find(c => c.branchRule === pr.head.ref) ?? repo.configs.find(c => c.branchRule === "*");
  // Previews never inherit production secrets, even for branches in the same repository.
  if (!config || (config.profile as { requiredSecretNames?: string[] }).requiredSecretNames?.length) return "ignored-preview-profile";
  const worker = repo.workers.find(w => workerIsActive(w) && w.lastSeenAt && Date.now() - w.lastSeenAt.getTime() < 90000 && (w.capabilities as { runtimeManagement?: boolean })?.runtimeManagement);
  if (!worker) return "ignored-preview-worker";
  if (await tx.deployment.findFirst({ where: { repositoryId: repo.id, previewNumber: payload.number, commitSha: pr.head.sha, status: { not: "CANCELLED" } } })) return "preview.duplicate-commit";
  await cancelPending(tx, { repositoryId: repo.id, previewNumber: payload.number }, "Preview superseded");
  const environment = await tx.environment.upsert({ where: { repositoryId_name: { repositoryId: repo.id, name: "Preview PR #" + payload.number } }, update: {}, create: { repositoryId: repo.id, name: "Preview PR #" + payload.number, policy: {} } });
  let policy;
  try { policy = assertEnvironmentTarget(environment.policy, pr.head.ref, worker.id); } catch { return "ignored-preview-environment-policy"; }
  const deployment = await tx.deployment.create({ data: { repositoryId: repo.id, configId: config.id, environmentId: environment.id, targetWorkerId: worker.id, commitSha: pr.head.sha, sourceBranch: pr.head.ref, previewNumber: payload.number, releaseKind: "PREVIEW", approvalStatus: policy.requiresApproval ? "PENDING" : "NOT_REQUIRED", trigger: "PUSH", secretSnapshot: [], stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map(name => ({ name })) }, events: { create: { type: "preview.created", payload: { pullRequest: payload.number! } } } } });
  return "deployment-created:" + deployment.id;
}
