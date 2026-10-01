import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { db } from "@deploypilot/database/client";
import { AuthService } from "./auth.service.js";
import { GitHubService } from "./github.service.js";
import { repositoryAccess } from "./access.js";
import { cancelPending } from "./cancel-pending.js";
@Controller()
export class RepositoryLifecycleController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(GitHubService) private readonly github: GitHubService) {}
  @Get("/v1/repositories/archived")
  async archived(@Req() request: Request) {
    const user = await this.auth.user(request);
    return { repositories: await db.repository.findMany({ where: { AND: [repositoryAccess(user.id, "admin", true), { archivedAt: { not: null } }] }, select: { id: true, fullName: true } }) };
  }
  @Patch("/v1/repositories/:repositoryId/previews")
  async previews(@Req() request: Request, @Param("repositoryId") id: string, @Body() body: { enabled?: boolean }) {
    const user = await this.auth.user(request);
    if (typeof body.enabled !== "boolean") throw new BadRequestException("Choose whether previews are enabled");
    const result = await db.repository.updateMany({ where: { id, ...repositoryAccess(user.id, "admin") }, data: { previewEnabled: body.enabled } });
    if (!result.count) throw new NotFoundException("Repository not found");
    return { enabled: body.enabled };
  }
  @Post("/v1/repositories/:repositoryId/archive")
  async archive(@Req() request: Request, @Param("repositoryId") id: string, @Body() body: { fullName?: string }) {
    const user = await this.auth.user(request);
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Repository" WHERE id = ${id} FOR UPDATE`;
      const repo = await tx.repository.findFirst({ where: { id, ...repositoryAccess(user.id, "admin") } });
      if (!repo) throw new NotFoundException("Repository not found");
      if (body.fullName !== repo.fullName) throw new BadRequestException("Type the repository name to disconnect it");
      if (await tx.deployment.count({ where: { repositoryId: id, status: "RUNNING" } }) || await tx.deploymentRuntime.count({ where: { deployment: { repositoryId: id }, state: { notIn: ["STOPPED", "MISSING"] } } })) throw new BadRequestException("Stop recorded runtimes and wait for builds before disconnecting");
      await cancelPending(tx, { repositoryId: id }, "Repository disconnected");
      await tx.worker.updateMany({ where: { repositoryId: id }, data: { revokedAt: new Date() } });
      await tx.repository.update({ where: { id }, data: { archivedAt: new Date(), previewEnabled: false } });
      return { archived: true };
    });
  }
  @Post("/v1/repositories/:repositoryId/restore")
  async restore(@Req() request: Request, @Param("repositoryId") id: string) {
    const user = await this.auth.user(request);
    const repo = await db.repository.findFirst({ where: { id, ...repositoryAccess(user.id, "admin", true) }, include: { installation: true } });
    if (!repo?.installation || repo.installation.revokedAt || repo.installation.suspendedAt) throw new BadRequestException("Synchronize an active GitHub installation first");
    const available = await this.github.listRepositories(repo.installation.installationId);
    if (!available.some(r => String(r.id) === repo.githubRepoId)) throw new BadRequestException("GitHub App no longer has access to this repository");
    await db.repository.update({ where: { id }, data: { archivedAt: null } });
    return { restored: true, message: "Register new worker credentials before deploying" };
  }
}
