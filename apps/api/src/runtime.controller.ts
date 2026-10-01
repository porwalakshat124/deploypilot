import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { db } from "@deploypilot/database/client";
import { AuthService } from "./auth.service.js";
import { repositoryAccess } from "./access.js";
import { workerIsActive, workerTokenMatches } from "./worker-auth.js";
export async function authenticateWorker(request: Request, id: string) {
  const worker = await db.worker.findUnique({ where: { id } });
  const header = request.headers.authorization;
  if (!worker || !workerIsActive(worker) || !header?.startsWith("Bearer ") || !workerTokenMatches(header.slice(7), worker.tokenHash)) throw new UnauthorizedException();
  return worker;
}
@Controller()
export class RuntimeController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Get("/v1/deployments/:deploymentId/runtime")
  async detail(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, repository: repositoryAccess(user.id) }, select: { repositoryId: true, status: true, releaseKind: true, runtime: { include: { commands: { orderBy: { createdAt: "desc" }, take: 10 } } } } });
    if (!deployment) throw new NotFoundException("Deployment not found");
    return { ...deployment, canControl: Boolean(await db.repository.findFirst({ where: { id: deployment.repositoryId, ...repositoryAccess(user.id, "deploy") }, select: { id: true } })) };
  }
  @Post("/v1/deployments/:deploymentId/runtime/:action")
  async control(@Req() request: Request, @Param("deploymentId") deploymentId: string, @Param("action") action: string) {
    const user = await this.auth.user(request);
    const operation = action.toUpperCase();
    if (!["STOP", "START", "RESTART"].includes(operation)) throw new BadRequestException("Invalid runtime command");
    const runtime = await db.deploymentRuntime.findFirst({ where: { deploymentId, deployment: { repository: repositoryAccess(user.id, "deploy") } } });
    if (!runtime) throw new NotFoundException("Runtime not found");
    const worker = await db.worker.findUnique({ where: { id: runtime.workerId } });
    if (!workerIsActive(worker) || !(worker?.capabilities as { runtimeManagement?: boolean })?.runtimeManagement) throw new BadRequestException("Update the assigned worker to version 1.2 for runtime controls");
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "DeploymentRuntime" WHERE id = ${runtime.id} FOR UPDATE`;
      if (await tx.runtimeCommand.findFirst({ where: { runtimeId: runtime.id, status: { in: ["PENDING", "RUNNING"] } } })) throw new BadRequestException("Wait for the current runtime command to finish");
      const command = await tx.runtimeCommand.create({ data: { runtimeId: runtime.id, action: operation, actorId: user.id } });
      await tx.deploymentRuntime.update({ where: { id: runtime.id }, data: { desiredState: operation === "STOP" ? "STOPPED" : "RUNNING" } });
      await tx.deploymentEvent.create({ data: { deploymentId, type: "runtime.command", payload: { action: operation, actorId: user.id } } });
      return { commandId: command.id, status: "PENDING" };
    });
  }
  @Get("/v1/workers/:workerId/runtimes")
  async inventory(@Req() request: Request, @Param("workerId") id: string) {
    const worker = await authenticateWorker(request, id);
    const runtimes = await db.deploymentRuntime.findMany({ where: { workerId: id, deployment: { repositoryId: worker.repositoryId } }, orderBy: { observedAt: "asc" }, take: 100, select: { id: true, deploymentId: true, endpoint: true, desiredState: true, deployment: { select: { config: { select: { profile: true } } } } } });
    return { runtimes };
  }
  @Post("/v1/workers/:workerId/runtimes/:runtimeId/report")
  async report(@Req() request: Request, @Param("workerId") workerId: string, @Param("runtimeId") runtimeId: string, @Body() body: { state?: string; endpoint?: string }) {
    const worker = await authenticateWorker(request, workerId);
    if (!["HEALTHY", "UNHEALTHY", "STOPPED", "MISSING"].includes(body.state ?? "")) throw new BadRequestException("Invalid runtime state");
    if (body.endpoint && !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(body.endpoint)) throw new BadRequestException("Invalid runtime endpoint");
    const result = await db.deploymentRuntime.updateMany({ where: { id: runtimeId, workerId, deployment: { repositoryId: worker.repositoryId } }, data: { state: body.state, observedAt: new Date(), ...(body.endpoint ? { endpoint: body.endpoint } : {}) } });
    if (!result.count) throw new NotFoundException("Runtime not found");
    return { reported: true };
  }
  @Post("/v1/workers/:workerId/runtime-commands/claim")
  async claim(@Req() request: Request, @Param("workerId") workerId: string) {
    const worker = await authenticateWorker(request, workerId);
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Worker" WHERE id = ${workerId} FOR UPDATE`;
      const current = await tx.worker.findUnique({ where: { id: workerId } });
      if (!current || !workerIsActive(current) || !workerTokenMatches(request.headers.authorization?.slice(7) ?? "", current.tokenHash)) throw new UnauthorizedException();
      const expired = new Date(Date.now() - 90000);
      await tx.runtimeCommand.updateMany({ where: { runtime: { workerId }, status: "RUNNING", attempts: { gte: 3 }, startedAt: { lt: expired } }, data: { status: "FAILED", endedAt: new Date() } });
      const command = await tx.runtimeCommand.findFirst({ where: { runtime: { workerId, deployment: { repositoryId: worker.repositoryId } }, attempts: { lt: 3 }, OR: [{ status: "PENDING" }, { status: "RUNNING", startedAt: { lt: new Date(Date.now() - 90000) } }] }, orderBy: { createdAt: "asc" }, include: { runtime: { select: { deploymentId: true } } } });
      if (!command) return { command: null };
      await tx.runtimeCommand.update({ where: { id: command.id }, data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } } });
      return { command: { id: command.id, action: command.action, attempt: command.attempts + 1, deploymentId: command.runtime.deploymentId } };
    });
  }
  @Post("/v1/workers/:workerId/runtime-commands/:commandId/complete")
  async complete(@Req() request: Request, @Param("workerId") workerId: string, @Param("commandId") commandId: string, @Body() body: { success?: boolean; attempt?: number }) {
    const worker = await authenticateWorker(request, workerId);
    if (!Number.isInteger(body.attempt) || body.attempt! < 1 || body.attempt! > 3) throw new BadRequestException("Invalid command attempt");
    const result = await db.runtimeCommand.updateMany({ where: { id: commandId, status: "RUNNING", attempts: body.attempt, runtime: { workerId, deployment: { repositoryId: worker.repositoryId } } }, data: { status: body.success === true ? "SUCCEEDED" : "FAILED", endedAt: new Date() } });
    if (!result.count) throw new NotFoundException("Active runtime command not found");
    return { completed: true };
  }
}
