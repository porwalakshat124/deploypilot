import { Controller, Get, Post, Req, Param, Inject, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import { db } from "@deploypilot/database/client";
import { AuthService } from "./auth.service.js";
import { repositoryAccess } from "./access.js";

@Controller()
export class OperationsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("/v1/repositories/:repositoryId/operations")
  async overview(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    if (!await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id) }, select: { id: true } })) throw new NotFoundException("Repository not found");
    const admin = Boolean(await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id, "admin") }, select: { id: true } }));
    const [counts, active, effects] = await Promise.all([
      db.deployment.groupBy({ by: ["status"], where: { repositoryId }, _count: true }),
      db.deployment.findMany({ where: { repositoryId, status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "asc" }, take: 100, select: { id: true, commitSha: true, status: true, approvalStatus: true, targetWorkerId: true, createdAt: true } }),
      admin ? db.deploymentEffect.findMany({ where: { deployment: { repositoryId }, status: { in: ["FAILED", "PENDING", "PROCESSING"] } }, take: 50, orderBy: { createdAt: "desc" }, select: { id: true, deploymentId: true, kind: true, status: true, attempts: true, nextAttemptAt: true, lastError: true } }) : Promise.resolve([])
    ]);
    return { counts, active, effects, canManage: admin, transport: "Durable PostgreSQL polling", limits: "One active deployment per worker. Showing up to 100 active runs and 50 outstanding provider deliveries." };
  }

  @Post("/v1/deliveries/:deliveryId/retry")
  async retry(@Req() request: Request, @Param("deliveryId") deliveryId: string) {
    const user = await this.auth.user(request);
    const result = await db.deploymentEffect.updateMany({ where: { id: deliveryId, status: "FAILED", deployment: { repository: repositoryAccess(user.id, "admin") } }, data: { status: "PENDING", attempts: 0, lockedAt: null, lastError: null, nextAttemptAt: new Date() } });
    if (result.count !== 1) throw new NotFoundException("Failed delivery not found");
    return { id: deliveryId, status: "PENDING" };
  }
}
