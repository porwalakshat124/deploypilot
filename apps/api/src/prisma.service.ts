import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { db } from "@deploypilot/database/client";
import { finishDeployment } from "./execution-state.js";
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private recovering = false;
  async onModuleInit() {
    await db.$connect();
    this.timer = setInterval(() => void this.recover().catch(error => console.error("[recovery] failed", error instanceof Error ? error.name : "error")), 30000);
  }
  async recover() {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const jobs = await db.deployment.findMany({ where: { status: "RUNNING" }, include: { config: true }, orderBy: { startedAt: "asc" }, take: 100 });
      for (const job of jobs) {
        if (!job.targetWorkerId || !job.startedAt) continue;
        const timeout = Math.min(Number((job.config.profile as { timeoutSeconds?: number }).timeoutSeconds) || 900, 3600);
        const worker = await db.worker.findUnique({ where: { id: job.targetWorkerId } });
        const expired = Date.now() - job.startedAt.getTime() > (timeout + 60) * 1000;
        const offline = !worker || worker.revokedAt || !worker.lastSeenAt || Date.now() - worker.lastSeenAt.getTime() > 90000;
        if (expired || offline) await finishDeployment(job.id, job.targetWorkerId, expired ? "TIMED_OUT" : "FAILED", expired ? "Deployment exceeded its execution deadline" : "Worker stopped reporting heartbeats or was revoked").catch(() => undefined);
      }
    } finally { this.recovering = false; }
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await db.$disconnect(); }
  get client() { return db; }
}
