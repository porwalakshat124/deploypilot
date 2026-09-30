import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });

  private readonly deployments = new Queue("deployments", { connection: this.connection });

  async enqueue(deploymentId: string) {
    await this.deployments.add("deployment", { deploymentId }, { jobId: deploymentId, attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 });
  }

  async onModuleDestroy() { await this.deployments.close(); await this.connection.quit(); }
}
