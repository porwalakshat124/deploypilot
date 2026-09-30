import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { db } from "@deploypilot/database/client";
import { GitHubService } from "./github.service.js";
import { NotificationsService } from "./notifications.service.js";
import { r2 } from "./r2.service.js";
import { redactLog } from "./diagnosis-context.js";
@Injectable()
export class DeploymentEffectsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(@Inject(GitHubService) private readonly github: GitHubService, @Inject(NotificationsService) private readonly notifications: NotificationsService) {}
  onModuleInit() { this.timer = setInterval(() => void this.process().catch(() => console.error("[effects] processing failed")), 10000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async process() {
    if (this.busy) return;
    this.busy = true;
    try {
      await db.deploymentEffect.updateMany({ where: { status: "PROCESSING", lockedAt: { lt: new Date(Date.now() - 120000) } }, data: { status: "PENDING", lockedAt: null } });
      const jobs = await db.deploymentEffect.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: 10 });
      for (const job of jobs) {
        const claim = await db.deploymentEffect.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "PROCESSING", lockedAt: new Date(), attempts: { increment: 1 } } });
        if (!claim.count) continue;
        try {
          const deployment = await db.deployment.findUniqueOrThrow({ where: { id: job.deploymentId }, include: { repository: { include: { installation: true } } } });
          let skipped = false;
          if (job.kind === "archive") {
            if (!r2.configured()) skipped = true;
            else {
              const logs = await db.deploymentLog.findMany({ where: { deploymentId: deployment.id }, orderBy: { sequence: "asc" }, take: 50001 });
              if (logs.length > 50000) throw new Error("Archive limit exceeded; use paginated log export");
              await r2.archiveLogs(deployment.id, logs);
            }
          } else if (job.kind === "email") {
            skipped = !(await this.notifications.deploymentResult(deployment.id, deployment.status)).sent;
          } else if (job.kind === "github-status") {
            if (!deployment.repository.installation || !/^[a-f0-9]{40}$/i.test(deployment.commitSha)) skipped = true;
            else await this.github.setCommitStatus(deployment.repository.installation.installationId, deployment.repository.fullName, deployment.commitSha, deployment.status === "SUCCEEDED" ? "success" : "failure", "Deployment " + deployment.status.toLowerCase(), process.env.WEB_ORIGIN?.split(",")[0] ? process.env.WEB_ORIGIN.split(",")[0] + "/dashboard/deployments/" + deployment.id : undefined);
          } else throw new Error("Unknown deployment effect");
          await db.deploymentEffect.update({ where: { id: job.id }, data: { status: skipped ? "SKIPPED" : "SUCCEEDED", lockedAt: null, lastError: null } });
        } catch (error) {
          const attempts = job.attempts + 1;
          await db.deploymentEffect.update({ where: { id: job.id }, data: { status: attempts >= 5 ? "FAILED" : "PENDING", lockedAt: null, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 10000 * 2 ** attempts)), lastError: redactLog(error instanceof Error ? error.message : "Integration failed").slice(0, 1000) } });
        }
      }
    } finally { this.busy = false; }
  }
}
