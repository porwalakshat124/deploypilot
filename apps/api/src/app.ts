import dotenv from "dotenv";
import "reflect-metadata";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
import { BadRequestException, Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, Post, Req, Res, Sse, UnauthorizedException, ForbiddenException, Patch, Delete } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
export { AuthService } from "./auth.service.js";
import { RepositoryLifecycleController } from "./repository-lifecycle.controller.js";
import { githubPreview, type PreviewPayload } from "./github-previews.js";
import { githubLifecycle, type LifecyclePayload } from "./github-lifecycle.js";
import { ReleasesController } from "./releases.controller.js";
import { RuntimeController } from "./runtime.controller.js";
import { SecretsController } from "./secrets.controller.js";
import { snapshotSecrets, runtimeEnvironment } from "./environment-secrets.js";
import { OperationsController } from "./operations.controller.js";
import { TeamsController } from "./teams.controller.js";
import { repositoryAccess } from "./access.js";
import { environmentPolicy, assertEnvironmentTarget } from "./environment-policy.js";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db } from "@deploypilot/database/client";
import { DeploymentStatus, DeploymentTrigger } from "@prisma/client";
import { GitHubService } from "./github.service.js";
import { PrismaService } from "./prisma.service.js";
import { createWorkerToken, hashWorkerToken, workerTokenMatches, workerIsActive } from "./worker-auth.js";
import { branchFromRef, verifyGitHubSignature, type PushPayload } from "./github-webhook.js";
import { DiagnosisService } from "./diagnosis.service.js";
import { validateProfile } from "./build-profile.js";
import { appendLog, appendLogs, finishDeployment } from "./execution-state.js";
import { r2 } from "./r2.service.js";
import { NotificationsService } from "./notifications.service.js";
import { DeploymentEffectsService } from "./deployment-effects.service.js";

@Controller()
export class AppController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(GitHubService) private readonly github: GitHubService, @Inject(PrismaService) private readonly prisma: PrismaService, @Inject(DiagnosisService) private readonly diagnosis: DiagnosisService) {}

  @Get("/health") health() { return { service: "deploypilot-api", status: "ok", timestamp: new Date().toISOString() }; }

  @Get("/health/ready")
  async ready() { await db.$queryRaw`SELECT 1`; return { status: "ready", queue: "database-polling" }; }

  @Get("/ready")
  async legacyReady() { return this.ready(); }

  @Get("/v1/settings")
  async settings(@Req() request: Request) {
    const user = await this.auth.user(request);
    const failedDeliveries = await db.deploymentEffect.count({ where: { status: "FAILED", deployment: { repository: repositoryAccess(user.id) } } });
    return { integrations: [
      { name: "Supabase Auth", configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), description: "GitHub login and authenticated sessions" },
      { name: "GitHub App", configured: Boolean(process.env.GITHUB_APP_ID && (process.env.GITHUB_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY_PATH)), description: "Repository source, signed push events and commit statuses" },
      { name: "PostgreSQL", configured: Boolean(process.env.DATABASE_URL), description: "Deployment records and durable job polling" },
      { name: "Cloudflare R2", configured: r2.configured(), description: "Archived logs and signed downloads" },
      { name: "Resend", configured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL), description: "Deployment result notifications" },
      { name: "OpenAI", configured: process.env.AI_DIAGNOSIS_ENABLED !== "false" && Boolean(process.env.OPENAI_API_KEY), description: process.env.AI_DIAGNOSIS_ENABLED === "false" ? "AI diagnosis is disabled for this workspace" : "Evidence-based failure diagnosis" }
    ], failedDeliveries, workerProtocol: "HTTPS polling", providerDelivery: "Configuration status does not prove successful delivery" };
  }

  @Post("/v1/deployments/:deploymentId/logs/archive")
  async archiveLogs(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, repository: repositoryAccess(user.id) }, select: { id: true, status: true } });
    if (!deployment) throw new NotFoundException("Deployment not found");
    if (["RUNNING", "QUEUED"].includes(deployment.status)) throw new BadRequestException("Wait for the deployment to finish before archiving logs");
    if (!r2.configured()) throw new BadRequestException("R2 storage is not configured on the API");
    const logs = await db.deploymentLog.findMany({ where: { deploymentId }, orderBy: { sequence: "asc" }, take: 50001 });
    if (logs.length > 50000) throw new BadRequestException("Archive limit exceeded; use paginated export");
    return { ...await r2.archiveLogs(deploymentId, logs), downloadUrl: await r2.signedLogUrl(deploymentId) };
  }

  @Get("/v1/repositories")
  async listRepositories(@Req() request: Request) {
    const user = await this.auth.user(request);
    return { repositories: await db.repository.findMany({ where: repositoryAccess(user.id), orderBy: { fullName: "asc" }, include: { _count: { select: { configs: true, environments: true } }, workers: { where: { revokedAt: null }, select: { id: true, lastSeenAt: true } }, deployments: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true } } } }) };
  }

  @Get("/v1/github/installations/:installationId/repositories")
  async repositories(@Req() request: Request, @Param("installationId") installationId: string) {
    const user = await this.auth.user(request);
    const teamId = typeof request.query.teamId === "string" ? request.query.teamId : undefined;
    const account = await this.github.assertInstallationOwner(installationId, await this.auth.githubId(request), typeof request.headers["x-github-token"] === "string" ? request.headers["x-github-token"] : undefined);
    if (account.organization && !teamId) throw new BadRequestException("Choose a team for the organization installation");
    if (teamId && !await db.teamMember.findFirst({ where: { teamId, userId: user.id, role: { in: ["OWNER", "ADMIN"] }, team: { archivedAt: null } } })) throw new ForbiddenException("Team administrator access is required");
    const existingInstallation = await db.gitHubInstallation.findUnique({ where: { installationId } });
    if (existingInstallation && (existingInstallation.teamId ? existingInstallation.teamId !== teamId : existingInstallation.userId !== user.id)) throw new ForbiddenException("Installation is connected to another account or team");
    const githubRepositories = await this.github.listRepositories(installationId);
    const installation = await db.gitHubInstallation.upsert({ where: { installationId }, update: { accountLogin: account.accountLogin, revokedAt: null, suspendedAt: null }, create: { userId: user.id, teamId: account.organization ? teamId : null, installationId, accountLogin: account.accountLogin } });
    for (const repo of githubRepositories) {
      const existing = await db.repository.findUnique({ where: { githubRepoId: String(repo.id) } });
      if (existing && existing.installationId !== installation.id) throw new ForbiddenException("Repository is already connected through another installation");
      await db.repository.upsert({ where: { githubRepoId: String(repo.id) }, update: { fullName: repo.full_name, defaultBranch: repo.default_branch }, create: { githubRepoId: String(repo.id), fullName: repo.full_name, defaultBranch: repo.default_branch, ownerId: user.id, teamId: account.organization ? teamId : null, installationId: installation.id } });
    }
    await db.repository.updateMany({ where: { installationId: installation.id, githubRepoId: { notIn: githubRepositories.map(repo => String(repo.id)) } }, data: { archivedAt: new Date() } });
    return { repositories: await db.repository.findMany({ where: repositoryAccess(user.id), orderBy: { fullName: "asc" } }) };
  }

  @Get("/v1/repositories/:repositoryId/setup")
  async repositorySetup(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id) }, include: { configs: { orderBy: { createdAt: "desc" } }, environments: true, workers: { select: { id: true, name: true, version: true, lastSeenAt: true, revokedAt: true } } } });
    if (!repository) throw new NotFoundException("Repository not found");
    return repository;
  }

  private async sourceRepository(request: Request, repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id) }, include: { installation: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    if (!repository.installation || repository.installation.revokedAt || repository.installation.suspendedAt) throw new BadRequestException("GitHub installation is unavailable");
    return repository;
  }

  @Get("/v1/repositories/:repositoryId/branches")
  async repositoryBranches(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const repository = await this.sourceRepository(request, repositoryId);
    const value = request.query.page ?? "1";
    if (typeof value !== "string" || !/^[1-9]\d{0,4}$/.test(value)) throw new BadRequestException("Invalid branch page");
    return this.github.listBranches(repository.installation!.installationId, repository.fullName, Number(value));
  }

  @Get("/v1/repositories/:repositoryId/dockerfiles")
  async repositoryDockerfiles(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const repository = await this.sourceRepository(request, repositoryId);
    const branch = request.query.branch ?? repository.defaultBranch;
    if (typeof branch !== "string") throw new BadRequestException("A valid branch is required");
    return this.github.discoverDockerfiles(repository.installation!.installationId, repository.fullName, branch);
  }

  @Post("/v1/repositories/:repositoryId/configs")
  async createConfig(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { branchRule?: string; profile?: Record<string, unknown> }) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id, "deploy") }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    const profile = validateProfile(body.profile);
    if (typeof body.branchRule !== "string" || !body.branchRule.trim() || body.branchRule.length > 250) throw new BadRequestException("Branch rule is required");
    return db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Repository" WHERE id = ${repositoryId} FOR UPDATE`;
      const previous = await tx.deploymentConfig.findFirst({ where: { repositoryId, branchRule: body.branchRule }, orderBy: { version: "desc" } });
      return tx.deploymentConfig.create({ data: { repositoryId, branchRule: body.branchRule!, profile: profile as object, version: (previous?.version ?? 0) + 1 } });
    });
  }

  @Post("/v1/repositories/:repositoryId/environments")
  async createEnvironment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { name?: string; url?: string; policy?: unknown }) {
    const user = await this.auth.user(request);
    if (!body.name?.trim() || body.name.length > 80) throw new BadRequestException("Environment name is required, maximum 80 characters");
    if (body.url && !/^https?:\/\//.test(body.url)) throw new BadRequestException("Environment URL must use HTTP or HTTPS");
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id, "admin") }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    const policy = environmentPolicy(body.policy);
    await this.validateEnvironmentPolicy(repositoryId, policy);
    return db.environment.create({ data: { repositoryId, name: body.name.trim(), url: body.url, policy } });
  }

  @Post("/v1/repositories/:repositoryId/deployments")
  async createDeployment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { branch?: string; sha?: string; configId: string; environmentId: string; workerId: string }) {
    const user = await this.auth.user(request);
    if (!body.configId || !body.environmentId || !body.workerId || (!body.branch && !body.sha)) throw new BadRequestException("configId, environmentId, workerId, and branch or sha are required");
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id, "deploy") }, include: { configs: true, environments: true, installation: true, workers: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    const config = repository.configs.find((item) => item.id === body.configId);
    const environment = repository.environments.find((item) => item.id === body.environmentId);
    if (!config || !environment) throw new BadRequestException("Configuration or environment does not belong to repository");
    validateProfile(config.profile);
    if (!repository.workers.some(worker => worker.id === body.workerId && workerIsActive(worker))) throw new BadRequestException("Worker does not belong to this repository or has been revoked");
    if (!repository.installation) throw new BadRequestException("Repository has no GitHub installation");
    if (body.sha && !/^[a-f0-9]{40}$/i.test(body.sha)) throw new BadRequestException("Commit SHA must be a full 40-character hash");
    const branch = body.branch ?? repository.defaultBranch;
    if (config.branchRule !== "*" && config.branchRule !== branch) throw new BadRequestException("Branch does not match the build profile");
    const policy = assertEnvironmentTarget(environment.policy, branch, body.workerId);
    const commitSha = await this.github.resolveCommit(repository.installation.installationId, repository.fullName, body.sha ?? branch);
    if (body.sha && policy.allowedBranches.length && commitSha !== await this.github.resolveCommit(repository.installation.installationId, repository.fullName, branch)) throw new BadRequestException("Restricted environments require the current allowed branch head");
    const secretSnapshot = await snapshotSecrets(environment.id, (config.profile as { requiredSecretNames?: string[] }).requiredSecretNames);
    if (secretSnapshot.length && !(repository.workers.find(w => w.id === body.workerId)?.capabilities as { runtimeSecrets?: boolean })?.runtimeSecrets) throw new BadRequestException("Update this worker to version 1.2 before deploying secrets");
    const deployment = await db.deployment.create({ data: { secretSnapshot, repositoryId, configId: config.id, environmentId: environment.id, targetWorkerId: body.workerId, commitSha, sourceBranch: branch, requestedById: user.id, approvalStatus: policy.requiresApproval ? "PENDING" : "NOT_REQUIRED", trigger: DeploymentTrigger.MANUAL, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map((name) => ({ name })) } } });
    // Durable database polling is the remote worker queue; no public Redis credentials are needed.
    return { id: deployment.id, status: deployment.status, commitSha: deployment.commitSha };
  }

  @Get("/v1/repositories/:repositoryId/deployments")
  async deploymentHistory(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id) }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    const page = Number(request.query.page ?? 0);
    if (!Number.isInteger(page) || page < 0 || page > 10000) throw new BadRequestException("Invalid history page");
    const status = String(request.query.status ?? "");
    if (status && !Object.values(DeploymentStatus).includes(status as DeploymentStatus)) throw new BadRequestException("Invalid status filter");
    const search = String(request.query.search ?? "").slice(0, 100);
    const where = { repositoryId, ...(status ? { status: status as DeploymentStatus } : {}), ...(search ? { OR: [{ commitSha: { contains: search } }, { id: { contains: search } }] } : {}) };
    const [deployments, total] = await Promise.all([db.deployment.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * 25, take: 25, select: { id: true, commitSha: true, status: true, trigger: true, createdAt: true, startedAt: true, endedAt: true, targetWorkerId: true, environment: { select: { name: true, url: true } } } }), db.deployment.count({ where })]);
    return { deployments, total, page, hasMore: (page + 1) * 25 < total };
  }

  @Get("/v1/deployments/:deploymentId")
  async deployment(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const result = await db.deployment.findFirst({ where: { id: deploymentId, repository: repositoryAccess(user.id) }, include: { stages: true, repository: true, config: true, environment: true, diagnosis: true, runtime: { include: { commands: { orderBy: { createdAt: "desc" }, take: 10 } } }, events: { orderBy: { sequence: "desc" }, take: 50 } } });
    if (!result) throw new NotFoundException("Deployment not found");
    const canApprove = result.approvalStatus === "PENDING" && result.requestedById !== user.id && Boolean(await db.repository.findFirst({ where: { id: result.repositoryId, ...repositoryAccess(user.id, "admin") }, select: { id: true } }));
    const { secretSnapshot: _sealed, ...safeResult } = result;
    return { ...safeResult, canApprove, diagnosisEnabled: process.env.AI_DIAGNOSIS_ENABLED !== "false" && Boolean(process.env.OPENAI_API_KEY) };
  }

  @Get("/v1/overview")
  async latestDeployment(@Req() request: Request) {
    const user = await this.auth.user(request);
    const where = { repository: repositoryAccess(user.id) };
    const [deployments, counts] = await Promise.all([db.deployment.findMany({ where, orderBy: { createdAt: "desc" }, take: 10, include: { environment: true, repository: true, stages: true } }), db.deployment.groupBy({ by: ["status"], where, _count: true })]);
    return { deployments, counts };
  }

  @Get("/v1/deployments/:deploymentId/logs")
  async logs(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const cursor = Number(request.query.cursor ?? 0);
    const limit = Math.min(Number(request.query.limit ?? 200), 500);
    if (!Number.isInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1) throw new BadRequestException("Invalid log cursor or limit");
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, repository: repositoryAccess(user.id) }, select: { id: true } });
    if (!deployment) throw new NotFoundException("Deployment not found");
    const filter = (key: string, max = 100) => {
      const value = request.query[key];
      if (value === undefined) return undefined;
      if (typeof value !== "string" || value.length > max) throw new BadRequestException("Invalid log " + key);
      return value || undefined;
    };
    const from = filter("from"), to = filter("to"), level = filter("level"), stage = filter("stage"), search = filter("search", 200);
    if ((from && !Number.isFinite(Date.parse(from))) || (to && !Number.isFinite(Date.parse(to))) || (from && to && Date.parse(from) > Date.parse(to))) throw new BadRequestException("Invalid log time range");
    const logs = await db.deploymentLog.findMany({ where: { deploymentId, sequence: { gt: cursor }, ...(level ? { level } : {}), ...(stage ? { stage } : {}), ...(search ? { message: { contains: search, mode: "insensitive" } } : {}), ...((from || to) ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}) }, orderBy: { sequence: "asc" }, take: limit });
    return { logs, nextCursor: logs.at(-1)?.sequence ?? cursor, hasMore: logs.length === limit };
  }

  @Post("/v1/deployments/:deploymentId/cancel")
  async cancel(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    await db.$transaction(async tx => {
      const result = await tx.deployment.updateMany({ where: { id: deploymentId, status: { in: [DeploymentStatus.QUEUED, DeploymentStatus.RUNNING] }, repository: repositoryAccess(user.id, "deploy") }, data: { status: DeploymentStatus.CANCELLED, endedAt: new Date() } });
      if (result.count !== 1) throw new NotFoundException("Active deployment not found");
      await tx.deploymentStage.updateMany({ where: { deploymentId, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "SKIPPED", endedAt: new Date() } });
      await tx.deploymentEvent.create({ data: { deploymentId, type: "deployment.completed", payload: { deploymentId, status: "CANCELLED", reason: "Cancelled by an authorized user", actorId: user.id } } });
      await tx.deploymentEffect.createMany({ data: ["archive", "email", "github-status"].map(kind => ({ deploymentId, kind })), skipDuplicates: true });
    });
    return { id: deploymentId, status: DeploymentStatus.CANCELLED };
  }

  @Post("/v1/deployments/:deploymentId/approve")
  async approve(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    return db.$transaction(async tx => {
      const updated = await tx.deployment.updateMany({
        where: { id: deploymentId, status: "QUEUED", approvalStatus: "PENDING", OR: [{ requestedById: null }, { requestedById: { not: user.id } }], repository: repositoryAccess(user.id, "admin") },
        data: { approvalStatus: "APPROVED", approvedById: user.id, approvedAt: new Date() }
      });
      if (!updated.count) throw new BadRequestException("An administrator other than the requester must approve a pending deployment");
      await tx.deploymentEvent.create({ data: { deploymentId, type: "deployment.approved", payload: { actorId: user.id } } });
      return { id: deploymentId, approvalStatus: "APPROVED" };
    });
  }

  @Post("/v1/deployments/:deploymentId/retry")
  async retry(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const previous = await db.deployment.findFirst({ where: { id: deploymentId, status: { in: [DeploymentStatus.FAILED, DeploymentStatus.TIMED_OUT, DeploymentStatus.CANCELLED] }, repository: repositoryAccess(user.id, "deploy") }, include: { repository: { include: { configs: true, environments: true, workers: true } } } });
    if (!previous) throw new NotFoundException("Failed deployment not found");
    const config = previous.repository.configs.find((item) => item.id === previous.configId);
    const environment = previous.repository.environments.find((item) => item.id === previous.environmentId);
    const worker = previous.repository.workers.find((item) => item.id === previous.targetWorkerId && workerIsActive(item));
    if (!config || !environment || !worker) throw new BadRequestException("Deployment target is no longer available");
    validateProfile(config.profile);
    if (!/^[a-f0-9]{40}$/i.test(previous.commitSha)) throw new BadRequestException("Legacy deployment has no immutable SHA; create a new deployment");
    const policy = assertEnvironmentTarget(environment.policy, previous.sourceBranch, worker.id);
    const secretSnapshot = await snapshotSecrets(environment.id, (config.profile as { requiredSecretNames?: string[] }).requiredSecretNames);
    if (secretSnapshot.length && !(worker.capabilities as { runtimeSecrets?: boolean })?.runtimeSecrets) throw new BadRequestException("Update this worker to version 1.2 before deploying secrets");
    const deployment = await db.deployment.create({ data: { secretSnapshot, repositoryId: previous.repositoryId, configId: config.id, environmentId: environment.id, targetWorkerId: worker.id, commitSha: previous.commitSha, sourceBranch: previous.sourceBranch, requestedById: user.id, approvalStatus: policy.requiresApproval ? "PENDING" : "NOT_REQUIRED", trigger: DeploymentTrigger.RETRY, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map((name) => ({ name })) } } });
    await this.eventForWorker(deployment.id, "deployment.retry", { retriedFrom: deploymentId });
    return { id: deployment.id, status: deployment.status, commitSha: deployment.commitSha, retriedFrom: deploymentId };
  }

  @Post("/v1/deployments/:deploymentId/diagnose")
  async diagnose(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, repository: repositoryAccess(user.id, "deploy"), status: DeploymentStatus.FAILED }, select: { id: true } });
    if (!deployment) throw new NotFoundException("Failed deployment not found");
    return this.diagnosis.diagnose(deploymentId);
  }

  @Sse("/v1/deployments/:deploymentId/events")
  async events(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const authorized = await db.deployment.findFirst({ where: { id: deploymentId, repository: repositoryAccess(user.id) }, select: { id: true } });
    if (!authorized) throw new NotFoundException("Deployment not found");
    let cursor = String(request.headers["last-event-id"] ?? "");
    if (cursor && !await db.deploymentEvent.findFirst({ where: { id: cursor, deploymentId } })) cursor = "";
    return new Observable<{ id: string; type: string; data: unknown }>((subscriber) => {
      let closed = false;
      let busy = false;
      const emit = async () => {
        if (busy || closed) return;
        busy = true;
        try {
          if (!await db.deployment.findFirst({ where: { id: deploymentId, repository: repositoryAccess(user.id) }, select: { id: true } })) { subscriber.complete(); return; }
          const events = await db.deploymentEvent.findMany({ where: { deploymentId }, orderBy: { sequence: "asc" }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: 100 });
          for (const event of events) { if (closed) break; cursor = event.id; subscriber.next({ id: event.id, type: event.type, data: event.payload }); }
        } catch (error) { subscriber.error(error); }
        finally { busy = false; }
      };
      void emit();
      const timer = setInterval(() => { if (!closed) void emit(); }, 1000);
      return () => { closed = true; clearInterval(timer); };
    });
  }

  @Post("/webhooks/github")
  async githubWebhook(@Req() request: Request, @Body() payload: PushPayload) {
    const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !verifyGitHubSignature(rawBody, request.headers["x-hub-signature-256"] as string | undefined, process.env.GITHUB_WEBHOOK_SECRET)) throw new UnauthorizedException("Invalid GitHub webhook signature");
    const deliveryId = request.headers["x-github-delivery"] as string | undefined;
    if (request.headers["x-github-event"] !== "push") {
      const event = String(request.headers["x-github-event"] ?? "");
      if (!deliveryId) throw new BadRequestException("GitHub delivery ID is required");
      return db.$transaction(async tx => {
        const inserted = await tx.webhookDelivery.createMany({ data: [{ deliveryId, event }], skipDuplicates: true });
        if (!inserted.count) return { accepted: true, duplicate: true };
        const outcome = event === "pull_request" ? await githubPreview(tx, payload as PreviewPayload) : await githubLifecycle(tx, event, payload as LifecyclePayload);
        await tx.webhookDelivery.update({ where: { deliveryId }, data: { outcome, processedAt: new Date() } });
        return { accepted: true, outcome };
      });
    }
    if (!deliveryId || !payload.repository?.id || !payload.after) throw new BadRequestException("Invalid GitHub push payload");
    const branch = branchFromRef(payload.ref);
    if (request.headers["x-github-event"] !== "push" || !branch || !/^[a-f0-9]{40}$/i.test(payload.after) || /^0+$/.test(payload.after)) return { accepted: true, ignored: true };
    return db.$transaction(async tx => {
      const inserted = await tx.webhookDelivery.createMany({ data: [{ deliveryId, event: "push" }], skipDuplicates: true });
      if (!inserted.count) return { accepted: true, duplicate: true };
      const repository = await tx.repository.findFirst({ where: { githubRepoId: String(payload.repository!.id) }, include: { configs: { orderBy: { version: "desc" } }, environments: { orderBy: { name: "asc" } }, workers: { orderBy: { createdAt: "asc" } }, team: true } });
      const config = repository?.configs.find(item => item.branchRule === branch) ?? repository?.configs.find(item => item.branchRule === "*");
      const environment = repository?.environments.find(item => item.name.toLowerCase() === "production");
    const worker = repository?.workers.find(item => workerIsActive(item) && item.lastSeenAt && Date.now() - item.lastSeenAt.getTime() < 90000 && (item.capabilities as { apiPolling?: boolean } | null)?.apiPolling);
      if (!repository || !config || !environment || !worker) {
        await tx.webhookDelivery.update({ where: { deliveryId }, data: { processedAt: new Date(), outcome: "ignored-incomplete-configuration" } });
        return { accepted: true, ignored: true, reason: "Push deployment requires a matching profile, Production environment, and active worker" };
      }
      validateProfile(config.profile);
      let policy;
      try { policy = assertEnvironmentTarget(environment.policy, branch, worker.id); } catch {
        await tx.webhookDelivery.update({ where: { deliveryId }, data: { processedAt: new Date(), outcome: "ignored-environment-policy" } });
        return { accepted: true, ignored: true, reason: "Environment policy excludes this push target" };
      }
      if (repository.archivedAt || repository.team?.archivedAt) return { accepted: true, ignored: true };
      const secretSnapshot = await snapshotSecrets(environment.id, (config.profile as { requiredSecretNames?: string[] }).requiredSecretNames);
      if (secretSnapshot.length && !(worker.capabilities as { runtimeSecrets?: boolean })?.runtimeSecrets) return { accepted: true, ignored: true, reason: "Worker requires update for secrets" };
      const deployment = await tx.deployment.create({ data: { secretSnapshot, repositoryId: repository.id, configId: config.id, environmentId: environment.id, targetWorkerId: worker.id, commitSha: payload.after!, sourceBranch: branch, approvalStatus: policy.requiresApproval ? "PENDING" : "NOT_REQUIRED", trigger: DeploymentTrigger.PUSH, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map(name => ({ name })) } } });
      await tx.webhookDelivery.update({ where: { deliveryId }, data: { processedAt: new Date(), outcome: "deployment-created:" + deployment.id } });
      return { accepted: true, deploymentId: deployment.id };
    });
  }

  @Post("/v1/repositories/:repositoryId/workers/register")
  async registerWorker(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { name: string; version: string; maxConcurrency?: number; expiresInDays?: number }) {
    const user = await this.auth.user(request);
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 80 || typeof body.version !== "string" || !body.version || body.version.length > 50) throw new BadRequestException("Worker name (1–80) and version (1–50 characters) are required");
    const tokenExpiresAt = this.workerExpiry(body.expiresInDays);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id, "admin") } });
    if (!repository) throw new NotFoundException("Repository not found");
    const token = createWorkerToken();
    const worker = await db.worker.create({ data: { repositoryId, name: body.name, version: body.version, tokenHash: hashWorkerToken(token), tokenExpiresAt, credentialOwnerId: user.id, capabilities: { docker: true, maxConcurrency: 1 } } });
    return { workerId: worker.id, token, tokenExpiresAt, warning: "Store this token securely. It will not be shown again." };
  }

  @Get("/v1/repositories/:repositoryId/workers")
  async workers(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ...repositoryAccess(user.id) }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    return { workers: await db.worker.findMany({ where: { repositoryId }, select: { id: true, name: true, version: true, capabilities: true, lastSeenAt: true, revokedAt: true, tokenExpiresAt: true, createdAt: true }, orderBy: { createdAt: "desc" } }) };
  }

  private workerExpiry(days: number | undefined) {
    const value = days ?? 90;
    if (!Number.isInteger(value) || value < 1 || value > 365) throw new BadRequestException("Worker token expiry must be 1–365 days");
    return new Date(Date.now() + value * 86400000);
  }

  @Get("/v1/workers/:workerId/history")
  async workerHistory(@Req() request: Request, @Param("workerId") workerId: string) {
    const user = await this.auth.user(request);
    if (!await db.worker.findFirst({ where: { id: workerId, repository: repositoryAccess(user.id) }, select: { id: true } })) throw new NotFoundException("Worker not found");
    return { deployments: await db.deployment.findMany({ where: { targetWorkerId: workerId }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, status: true, commitSha: true, createdAt: true, approvalStatus: true } }) };
  }

  @Post("/v1/workers/:workerId/revoke")
  async revokeWorker(@Req() request: Request, @Param("workerId") workerId: string) {
    const user = await this.auth.user(request);
    const worker = await db.worker.findFirst({ where: { id: workerId, repository: repositoryAccess(user.id, "admin") } });
    if (!worker) throw new NotFoundException("Worker not found");
    await db.worker.update({ where: { id: workerId }, data: { revokedAt: new Date() } });
    return { workerId, status: "REVOKED" };
  }

  @Post("/v1/workers/:workerId/rotate-token")
  async rotateWorkerToken(@Req() request: Request, @Param("workerId") workerId: string, @Body() body: { expiresInDays?: number } = {}) {
    const user = await this.auth.user(request);
    const token = createWorkerToken();
    const tokenExpiresAt = this.workerExpiry(body.expiresInDays);
    const result = await db.worker.updateMany({ where: { id: workerId, revokedAt: null, repository: repositoryAccess(user.id, "admin") }, data: { tokenHash: hashWorkerToken(token), tokenExpiresAt, credentialOwnerId: user.id } });
    if (!result.count) throw new NotFoundException("Active worker not found");
    return { workerId, token, tokenExpiresAt };
  }

  @Patch("/v1/repositories/:repositoryId/environments/:environmentId")
  async editEnvironment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Param("environmentId") environmentId: string, @Body() body: { name?: string; url?: string; policy?: unknown }) {
    const user = await this.auth.user(request);
    if (!body.name?.trim() || body.name.length > 80) throw new BadRequestException("Environment name is required, maximum 80 characters");
    if (body.url && !/^https?:\/\//.test(body.url)) throw new BadRequestException("Environment URL must use HTTP or HTTPS");
    const current = await db.environment.findFirst({ where: { id: environmentId, repositoryId, repository: repositoryAccess(user.id, "admin") } });
    if (!current) throw new NotFoundException("Environment not found");
    if (current.name.toLowerCase() === "production" && body.name.toLowerCase() !== "production") throw new BadRequestException("Production cannot be renamed");
    const policy = environmentPolicy(body.policy ?? current.policy);
    await this.validateEnvironmentPolicy(repositoryId, policy);
    return db.environment.update({ where: { id: environmentId }, data: { name: body.name.trim(), url: body.url || null, policy } });
  }

  private async validateEnvironmentPolicy(repositoryId: string, policy: ReturnType<typeof environmentPolicy>) {
    const repository = await db.repository.findUniqueOrThrow({ where: { id: repositoryId }, select: { teamId: true, workers: { where: { revokedAt: null }, select: { id: true } } } });
    if (policy.requiresApproval && !repository.teamId) throw new BadRequestException("Connect this repository to a team before requiring a second approver");
    if (policy.allowedWorkers.some(id => !repository.workers.some(worker => worker.id === id))) throw new BadRequestException("Allowed workers must belong to this repository");
  }

  @Delete("/v1/repositories/:repositoryId/environments/:environmentId")
  async deleteEnvironment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Param("environmentId") environmentId: string) {
    const user = await this.auth.user(request);
    const environment = await db.environment.findFirst({ where: { id: environmentId, repositoryId, repository: repositoryAccess(user.id, "admin") }, include: { _count: { select: { deployments: true } } } });
    if (!environment) throw new NotFoundException("Environment not found");
    if (environment.name.toLowerCase() === "production" || environment._count.deployments) throw new BadRequestException("Production and environments with deployment history cannot be deleted");
    await db.environment.delete({ where: { id: environmentId } });
    return { deleted: true };
  }

  @Post("/v1/workers/:workerId/heartbeat")
  async heartbeat(@Req() request: Request, @Param("workerId") workerId: string, @Body() body: { version?: string; capabilities?: { apiPolling?: boolean; runtimeSecrets?: boolean; runtimeManagement?: boolean } }) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const worker = await db.worker.findUnique({ where: { id: workerId } });
    if (!worker || !workerIsActive(worker) || !workerTokenMatches(token, worker.tokenHash)) throw new UnauthorizedException();
    const updated = await db.worker.update({ where: { id: workerId }, data: { lastSeenAt: new Date(), version: String(body.version ?? worker.version).slice(0, 50), ...(body.capabilities?.apiPolling === true ? { capabilities: { docker: true, apiPolling: true, maxConcurrency: 1, runtimeSecrets: body.capabilities.runtimeSecrets === true, runtimeManagement: body.capabilities.runtimeManagement === true } } : {}) } });
    return { workerId: updated.id, status: "ONLINE", lastSeenAt: updated.lastSeenAt };
  }

  private async authenticatedWorker(request: Request, workerId: string) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const worker = await db.worker.findUnique({ where: { id: workerId } });
    if (!worker || !workerIsActive(worker) || !workerTokenMatches(token, worker.tokenHash)) throw new UnauthorizedException();
    return worker;
  }

  @Post("/v1/workers/:workerId/jobs/claim")
  async claimWorkerJob(@Req() request: Request, @Param("workerId") workerId: string) {
    await this.authenticatedWorker(request, workerId);
    return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Worker" WHERE id = ${workerId} FOR UPDATE`;
    const currentWorker = await tx.worker.findUnique({ where: { id: workerId } });
    const credential = request.headers.authorization?.slice(7) ?? "";
    if (!currentWorker || !workerIsActive(currentWorker) || !workerTokenMatches(credential, currentWorker.tokenHash)) throw new UnauthorizedException();
    if (await tx.deployment.findFirst({ where: { targetWorkerId: workerId, status: "RUNNING" } })) return { job: null };
    const candidate = await tx.deployment.findFirst({
      where: { targetWorkerId: workerId, status: DeploymentStatus.QUEUED, approvalStatus: { in: ["NOT_REQUIRED", "APPROVED"] } },
      orderBy: { createdAt: "asc" },
      include: { config: true, environment: true, repository: { include: { team: true } } },
    });
    if (!candidate) return { job: null };
    if (candidate.repository.archivedAt || candidate.repository.team?.archivedAt || (candidate.requestedById && !await tx.repository.findFirst({ where: { id: candidate.repositoryId, ...repositoryAccess(candidate.requestedById, "deploy") }, select: { id: true } }))) {
      await tx.deployment.update({ where: { id: candidate.id }, data: { status: "CANCELLED", endedAt: new Date() } });
      await tx.deploymentStage.updateMany({ where: { deploymentId: candidate.id }, data: { status: "SKIPPED", endedAt: new Date() } });
      await tx.deploymentEffect.createMany({ data: ["archive", "email", "github-status"].map(kind => ({ deploymentId: candidate.id, kind })), skipDuplicates: true });
      await tx.deploymentEvent.create({ data: { deploymentId: candidate.id, type: "deployment.completed", payload: { status: "CANCELLED", reason: "Repository access was withdrawn before execution" } } });
      return { job: null };
    }
    try { assertEnvironmentTarget(candidate.environment?.policy, candidate.sourceBranch, workerId); }
    catch {
      await tx.deployment.update({ where: { id: candidate.id }, data: { status: "CANCELLED", endedAt: new Date() } });
      await tx.deploymentStage.updateMany({ where: { deploymentId: candidate.id }, data: { status: "SKIPPED", endedAt: new Date() } });
      await tx.deploymentEvent.create({ data: { deploymentId: candidate.id, type: "deployment.completed", payload: { status: "CANCELLED", reason: "Environment policy changed before execution" } } });
      await tx.deploymentEffect.createMany({ data: ["archive", "email", "github-status"].map(kind => ({ deploymentId: candidate.id, kind })), skipDuplicates: true });
      return { job: null };
    }
    if (environmentPolicy(candidate.environment?.policy).requiresApproval && candidate.approvalStatus !== "APPROVED") {
      await tx.deployment.update({ where: { id: candidate.id }, data: { approvalStatus: "PENDING" } });
      return { job: null };
    }
    const environment = runtimeEnvironment(candidate.secretSnapshot);
    if (Object.keys(environment).length && !(currentWorker.capabilities as { runtimeSecrets?: boolean })?.runtimeSecrets) return { job: null };
    const claimed = await tx.deployment.updateMany({
      where: { id: candidate.id, targetWorkerId: workerId, status: DeploymentStatus.QUEUED, approvalStatus: { in: ["NOT_REQUIRED", "APPROVED"] } },
      data: { status: DeploymentStatus.RUNNING, startedAt: new Date() },
    });
    if (claimed.count !== 1) return { job: null };
    await tx.deploymentEvent.create({ data: { deploymentId: candidate.id, type: "deployment.status", payload: { deploymentId: candidate.id, status: "RUNNING" } } });
    return { job: { deploymentId: candidate.id, commitSha: candidate.commitSha, profile: candidate.config.profile, runtimeEnvironment: environment, reuseImageId: candidate.reuseImageId } };
    });
  }

  @Get("/v1/workers/:workerId/deployments/:deploymentId/status")
  async workerStatus(@Req() request: Request, @Param("workerId") workerId: string, @Param("deploymentId") deploymentId: string) {
    await this.authenticatedWorker(request, workerId);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, targetWorkerId: workerId }, select: { status: true } });
    if (!deployment) throw new NotFoundException("Deployment not found");
    return deployment;
  }

  @Get("/v1/workers/:workerId/deployments/:deploymentId/source")
  async workerDeploymentSource(@Req() request: Request, @Res() response: Response, @Param("workerId") workerId: string, @Param("deploymentId") deploymentId: string) {
    await this.authenticatedWorker(request, workerId);
    const deployment = await db.deployment.findFirst({
      where: { id: deploymentId, targetWorkerId: workerId, status: DeploymentStatus.RUNNING },
      include: { repository: { include: { installation: true } } },
    });
    if (!deployment?.repository.installation) throw new NotFoundException("Deployment source is unavailable");
    if (!/^[a-f0-9]{40}$/i.test(deployment.commitSha)) throw new BadRequestException("Deployment source must be pinned to an immutable commit");
    const archive = await this.github.downloadArchive(deployment.repository.installation.installationId, deployment.repository.fullName, deployment.commitSha);
    response.status(200).setHeader("Content-Type", archive.headers.get("content-type") ?? "application/gzip");
    response.setHeader("Content-Disposition", "attachment; filename=source.tar.gz");
    if (!archive.body) throw new NotFoundException("Source archive is empty");
    let bytes = 0;
    const limit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > 50 * 1024 * 1024 ? new Error("Source archive exceeds 50 MiB") : null, chunk);
    } });
    await pipeline(Readable.fromWeb(archive.body as import("node:stream/web").ReadableStream), limit, response);
  }

  @Post("/v1/workers/:workerId/deployments/:deploymentId/stages/:stage")
  async workerStage(@Req() request: Request, @Param("workerId") workerId: string, @Param("deploymentId") deploymentId: string, @Param("stage") stage: string, @Body() body: { status?: "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED"; message?: string }) {
    await this.authenticatedWorker(request, workerId);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, targetWorkerId: workerId, status: DeploymentStatus.RUNNING }, select: { id: true } });
    if (!deployment) throw new NotFoundException("Active deployment not found");
    const status = body.status ?? "RUNNING";
    if (!["RUNNING", "SUCCEEDED", "FAILED", "SKIPPED"].includes(status) || !["dependencies", "tests", "docker-build", "health-check", "deploy"].includes(stage)) throw new BadRequestException("Invalid stage update");
    const now = new Date();
    await db.$transaction(async tx => {
      const active = await tx.deployment.updateMany({ where: { id: deploymentId, targetWorkerId: workerId, status: "RUNNING" }, data: { status: "RUNNING" } });
      if (!active.count) throw new NotFoundException("Deployment is no longer active");
      await tx.deploymentStage.update({ where: { deploymentId_name: { deploymentId, name: stage } }, data: { status, ...(status === "RUNNING" ? { startedAt: now } : { endedAt: now }) } });
      await tx.deploymentEvent.create({ data: { deploymentId, type: "stage.updated", payload: { deploymentId, stage, status, ...(status === "RUNNING" ? { startedAt: now.toISOString() } : { endedAt: now.toISOString() }) } } });
    });
    if (body.message) await this.logForWorker(deploymentId, stage, status === "FAILED" ? "error" : "info", body.message);
    return { deploymentId, stage, status };
  }

  @Post("/v1/workers/:workerId/deployments/:deploymentId/logs")
  async workerLog(@Req() request: Request, @Param("workerId") workerId: string, @Param("deploymentId") deploymentId: string, @Body() body: { stage?: string; level?: string; message?: string }) {
    await this.authenticatedWorker(request, workerId);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, targetWorkerId: workerId, status: DeploymentStatus.RUNNING }, select: { id: true } });
    if (!deployment || !body.message) throw new NotFoundException("Active deployment log was not found");
    await this.logForWorker(deploymentId, body.stage ?? "system", body.level ?? "info", body.message);
    return { accepted: true };
  }

  @Post("/v1/workers/:workerId/deployments/:deploymentId/logs/batch")
  async workerLogs(@Req() request: Request, @Param("workerId") workerId: string, @Param("deploymentId") deploymentId: string, @Body() body: { entries?: { stage: string; level: string; message: string }[] }) {
    await this.authenticatedWorker(request, workerId);
    if (!await db.deployment.findFirst({ where: { id: deploymentId, targetWorkerId: workerId, status: "RUNNING" }, select: { id: true } })) throw new NotFoundException("Active deployment not found");
    if (!Array.isArray(body.entries) || body.entries.some(item => !item || typeof item !== "object")) throw new BadRequestException("Invalid log entries");
    await appendLogs(deploymentId, body.entries);
    return { accepted: body.entries.length };
  }

  @Post("/v1/workers/:workerId/deployments/:deploymentId/complete")
  async completeWorkerDeployment(@Req() request: Request, @Param("workerId") workerId: string, @Param("deploymentId") deploymentId: string, @Body() body: { status?: "SUCCEEDED" | "FAILED" | "TIMED_OUT"; message?: string; endpoint?: string; imageId?: string }) {
    await this.authenticatedWorker(request, workerId);
    const status = body.status ?? DeploymentStatus.FAILED;
    return finishDeployment(deploymentId, workerId, status, body.message ?? "Deployment " + status.toLowerCase(), body.endpoint, body.imageId);
  }
  private logForWorker(deploymentId: string, stage: string, level: string, message: string) {
    return appendLog(deploymentId, stage, level, message);
  }

  private async eventForWorker(deploymentId: string, type: string, payload: Record<string, unknown>) {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Deployment" WHERE id = ${deploymentId} FOR UPDATE`;
      await tx.deploymentEvent.create({ data: { deploymentId, type, payload: payload as object } });
    });
  }
}

@Module({ controllers: [RepositoryLifecycleController, AppController, TeamsController, OperationsController, SecretsController, RuntimeController, ReleasesController], providers: [AuthService, GitHubService, PrismaService, DiagnosisService, NotificationsService, DeploymentEffectsService] })
export class AppModule {}
