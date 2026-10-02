import { BadRequestException, Body, Controller, Inject, NotFoundException, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { db } from "@deploypilot/database/client";
import { AuthService } from "./auth.service.js";
import { repositoryAccess } from "./access.js";
import { assertEnvironmentTarget } from "./environment-policy.js";
import { snapshotSecrets, profileSecretNames } from "./environment-secrets.js";
import { workerIsActive } from "./worker-auth.js";

@Controller()
export class ReleasesController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post("/v1/deployments/:deploymentId/promote")
  promote(@Req() request: Request, @Param("deploymentId") id: string, @Body() body: { environmentId?: string; workerId?: string }) { return this.release(request, id, body, "PROMOTE"); }
  @Post("/v1/deployments/:deploymentId/rollback")
  rollback(@Req() request: Request, @Param("deploymentId") id: string) { return this.release(request, id, {}, "ROLLBACK"); }
  private async release(request: Request, id: string, body: { environmentId?: string; workerId?: string }, kind: string) {
    const user = await this.auth.user(request);
    const source = await db.deployment.findFirst({ where: { id, status: "SUCCEEDED", repository: repositoryAccess(user.id, "deploy") }, include: { config: true, runtime: true } });
    if (!source) throw new NotFoundException("Successful source deployment not found");
    const environmentId = kind === "ROLLBACK" ? source.environmentId : body.environmentId;
    const workerId = kind === "ROLLBACK" ? source.targetWorkerId : body.workerId;
    if (!environmentId || !workerId) throw new BadRequestException("Target environment and worker are required");
    const env = await db.environment.findFirst({ where: { id: environmentId, repositoryId: source.repositoryId } });
    const worker = await db.worker.findFirst({ where: { id: workerId, repositoryId: source.repositoryId } });
    if (!env || !worker || !workerIsActive(worker)) throw new BadRequestException("Target environment or worker is unavailable");
    const policy = assertEnvironmentTarget(env.policy, source.sourceBranch, workerId);
    if (kind === "ROLLBACK" && !source.runtime?.imageId) throw new BadRequestException("Rollback requires a recorded immutable image from a version 1.2 worker");
    if (kind === "ROLLBACK" && !(worker.capabilities as { runtimeManagement?: boolean })?.runtimeManagement) throw new BadRequestException("Update the worker to version 1.2 before rollback");
    const secretSnapshot = await snapshotSecrets(env.id, profileSecretNames(source.config.profile));
    if ((source.config.profile as { buildSecretNames?: string[] }).buildSecretNames?.length && !(worker.capabilities as { buildSecrets?: boolean })?.buildSecrets) throw new BadRequestException("Update the worker to version 1.3 before deploying build secrets");
    if (secretSnapshot.length && !(worker.capabilities as { runtimeSecrets?: boolean })?.runtimeSecrets) throw new BadRequestException("Update the target worker before deploying secrets");
    return db.deployment.create({ data: {
      repositoryId: source.repositoryId, configId: source.configId, environmentId, targetWorkerId: workerId, commitSha: source.commitSha, sourceBranch: source.sourceBranch,
      trigger: "MANUAL", releaseKind: kind, sourceDeploymentId: source.id, ...(kind === "ROLLBACK" ? { reuseImageId: source.runtime!.imageId } : {}),
      requestedById: user.id, approvalStatus: policy.requiresApproval ? "PENDING" : "NOT_REQUIRED", secretSnapshot,
      stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map(name => ({ name })) },
      events: { create: { type: "deployment." + kind.toLowerCase(), payload: { sourceDeploymentId: source.id, actorId: user.id } } }
    }, select: { id: true, status: true, approvalStatus: true } });
  }
}
