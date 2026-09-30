import dotenv from "dotenv";
import "reflect-metadata";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
import { BadRequestException, Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, Post, Req, Res, Sse, UnauthorizedException, ForbiddenException, Patch, Delete } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { db } from "@deploypilot/database/client";
import { DeploymentStatus, DeploymentTrigger } from "@prisma/client";
import { GitHubService } from "./github.service.js";
import { PrismaService } from "./prisma.service.js";
import { createWorkerToken, hashWorkerToken, workerTokenMatches } from "./worker-auth.js";
import { branchFromRef, verifyGitHubSignature, type PushPayload } from "./github-webhook.js";
import { DiagnosisService } from "./diagnosis.service.js";
import { validateProfile } from "./build-profile.js";
import { appendLog, finishDeployment } from "./execution-state.js";
import { r2 } from "./r2.service.js";
import { NotificationsService } from "./notifications.service.js";
import { DeploymentEffectsService } from "./deployment-effects.service.js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");


@Injectable()
export class AuthService {
  async githubId(request: Request) {
    const token = request.headers.authorization?.replace(/^Bearer /, "");
    const { data, error } = await supabase.auth.getUser(token);
    const identity = data.user?.identities?.find(item => item.provider === "github");
    const id = identity?.identity_data?.provider_id ?? identity?.identity_data?.sub;
    if (error || !id) throw new ForbiddenException("Sign in with GitHub to synchronize repositories");
    return String(id);
  }
  async user(request: Request) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException();
    const { data, error } = await supabase.auth.getUser(authorization.slice(7));
    if (error || !data.user || !data.user.email) throw new UnauthorizedException();
    return db.user.upsert({ where: { supabaseId: data.user.id }, update: { email: data.user.email, displayName: data.user.user_metadata?.user_name ?? data.user.email }, create: { supabaseId: data.user.id, email: data.user.email, displayName: data.user.user_metadata?.user_name ?? data.user.email } });
  }
}

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
    const failedDeliveries = await db.deploymentEffect.count({ where: { status: "FAILED", deployment: { repository: { ownerId: user.id } } } });
    return { integrations: [
      { name: "Supabase Auth", configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), description: "GitHub login and authenticated sessions" },
      { name: "GitHub App", configured: Boolean(process.env.GITHUB_APP_ID && (process.env.GITHUB_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY_PATH)), description: "Repository source, signed push events and commit statuses" },
      { name: "PostgreSQL", configured: Boolean(process.env.DATABASE_URL), description: "Deployment records and durable job polling" },
      { name: "Cloudflare R2", configured: r2.configured(), description: "Archived logs and signed downloads" },
      { name: "Resend", configured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL), description: "Deployment result notifications" },
      { name: "OpenAI", configured: Boolean(process.env.OPENAI_API_KEY), description: "Evidence-based failure diagnosis" }
    ], failedDeliveries, workerProtocol: "HTTPS polling", providerDelivery: "Configuration status does not prove successful delivery" };
  }

  @Post("/v1/deployments/:deploymentId/logs/archive")
  async archiveLogs(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, repository: { ownerId: user.id } }, select: { id: true, status: true } });
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
    return { repositories: await db.repository.findMany({ where: { ownerId: user.id }, orderBy: { fullName: "asc" }, include: { _count: { select: { configs: true, environments: true } }, workers: { where: { revokedAt: null }, select: { id: true, lastSeenAt: true } }, deployments: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true } } } }) };
  }

  @Get("/v1/github/installations/:installationId/repositories")
  async repositories(@Req() request: Request, @Param("installationId") installationId: string) {
    const user = await this.auth.user(request);
    await this.github.assertInstallationOwner(installationId, await this.auth.githubId(request));
    const existingInstallation = await db.gitHubInstallation.findUnique({ where: { installationId } });
    if (existingInstallation && existingInstallation.userId !== user.id) throw new ForbiddenException("Installation belongs to another account");
    const githubRepositories = await this.github.listRepositories(installationId);
    const installation = await db.gitHubInstallation.upsert({ where: { installationId }, update: { accountLogin: githubRepositories[0]?.full_name.split("/")[0] ?? "unknown" }, create: { userId: user.id, installationId, accountLogin: githubRepositories[0]?.full_name.split("/")[0] ?? "unknown" } });
    for (const repo of githubRepositories) await db.repository.upsert({ where: { githubRepoId: String(repo.id) }, update: { fullName: repo.full_name, defaultBranch: repo.default_branch, ownerId: user.id, installationId: installation.id }, create: { githubRepoId: String(repo.id), fullName: repo.full_name, defaultBranch: repo.default_branch, ownerId: user.id, installationId: installation.id } });
    return { repositories: await db.repository.findMany({ where: { ownerId: user.id }, orderBy: { fullName: "asc" } }) };
  }

  @Get("/v1/repositories/:repositoryId/setup")
  async repositorySetup(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, include: { configs: { orderBy: { createdAt: "desc" } }, environments: true, workers: { select: { id: true, name: true, version: true, lastSeenAt: true, revokedAt: true } } } });
    if (!repository) throw new NotFoundException("Repository not found");
    return repository;
  }

  @Post("/v1/repositories/:repositoryId/configs")
  async createConfig(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { branchRule?: string; profile?: Record<string, unknown> }) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    const profile = validateProfile(body.profile);
    if (!body.branchRule || body.branchRule.length > 250) throw new BadRequestException("Branch rule is required");
    const previous = await db.deploymentConfig.findFirst({ where: { repositoryId, branchRule: body.branchRule }, orderBy: { version: "desc" } });
    return db.deploymentConfig.create({ data: { repositoryId, branchRule: body.branchRule, profile: profile as object, version: (previous?.version ?? 0) + 1 } });
  }

  @Post("/v1/repositories/:repositoryId/environments")
  async createEnvironment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { name?: string; url?: string }) {
    const user = await this.auth.user(request);
    if (!body.name?.trim() || body.name.length > 80) throw new BadRequestException("Environment name is required, maximum 80 characters");
    if (body.url && !/^https?:\/\//.test(body.url)) throw new BadRequestException("Environment URL must use HTTP or HTTPS");
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    return db.environment.create({ data: { repositoryId, name: body.name, url: body.url, policy: { allowedWorkers: [] } } });
  }

  @Post("/v1/repositories/:repositoryId/deployments")
  async createDeployment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { branch?: string; sha?: string; configId: string; environmentId: string; workerId: string }) {
    const user = await this.auth.user(request);
    if (!body.configId || !body.environmentId || !body.workerId || (!body.branch && !body.sha)) throw new BadRequestException("configId, environmentId, workerId, and branch or sha are required");
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, include: { configs: true, environments: true, installation: true, workers: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    const config = repository.configs.find((item) => item.id === body.configId);
    const environment = repository.environments.find((item) => item.id === body.environmentId);
    if (!config || !environment) throw new BadRequestException("Configuration or environment does not belong to repository");
    validateProfile(config.profile);
    if (!repository.workers.some(worker => worker.id === body.workerId && !worker.revokedAt)) throw new BadRequestException("Worker does not belong to this repository or has been revoked");
    if (!repository.installation) throw new BadRequestException("Repository has no GitHub installation");
    if (body.sha && !/^[a-f0-9]{40}$/i.test(body.sha)) throw new BadRequestException("Commit SHA must be a full 40-character hash");
    const branch = body.branch ?? repository.defaultBranch;
    if (config.branchRule !== "*" && config.branchRule !== branch) throw new BadRequestException("Branch does not match the build profile");
    const commitSha = await this.github.resolveCommit(repository.installation.installationId, repository.fullName, body.sha ?? branch);
    const deployment = await db.deployment.create({ data: { repositoryId, configId: config.id, environmentId: environment.id, targetWorkerId: body.workerId, commitSha, trigger: DeploymentTrigger.MANUAL, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map((name) => ({ name })) } } });
    // Durable database polling is the remote worker queue; no public Redis credentials are needed.
    return { id: deployment.id, status: deployment.status, commitSha: deployment.commitSha };
  }

  @Get("/v1/repositories/:repositoryId/deployments")
  async deploymentHistory(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, select: { id: true } });
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
    const result = await db.deployment.findFirst({ where: { id: deploymentId, repository: { ownerId: user.id } }, include: { stages: true, repository: true, config: true, environment: true, diagnosis: true, events: { orderBy: { sequence: "desc" }, take: 50 } } });
    if (!result) throw new NotFoundException("Deployment not found");
    return result;
  }

  @Get("/v1/overview")
  async latestDeployment(@Req() request: Request) {
    const user = await this.auth.user(request);
    const where = { repository: { ownerId: user.id } };
    const [deployments, counts] = await Promise.all([db.deployment.findMany({ where, orderBy: { createdAt: "desc" }, take: 10, include: { environment: true, repository: true, stages: true } }), db.deployment.groupBy({ by: ["status"], where, _count: true })]);
    return { deployments, counts };
  }

  @Get("/v1/deployments/:deploymentId/logs")
  async logs(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const cursor = Number(request.query.cursor ?? 0);
    const limit = Math.min(Number(request.query.limit ?? 200), 500);
    if (!Number.isInteger(cursor) || cursor < 0 || !Number.isInteger(limit) || limit < 1) throw new BadRequestException("Invalid log cursor or limit");
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, repository: { ownerId: user.id } }, select: { id: true } });
    if (!deployment) throw new NotFoundException("Deployment not found");
    const logs = await db.deploymentLog.findMany({ where: { deploymentId, sequence: { gt: cursor } }, orderBy: { sequence: "asc" }, take: limit });
    return { logs, nextCursor: logs.at(-1)?.sequence ?? cursor, hasMore: logs.length === limit };
  }

  @Post("/v1/deployments/:deploymentId/cancel")
  async cancel(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    await db.$transaction(async tx => {
      const result = await tx.deployment.updateMany({ where: { id: deploymentId, status: { in: [DeploymentStatus.QUEUED, DeploymentStatus.RUNNING] }, repository: { ownerId: user.id } }, data: { status: DeploymentStatus.CANCELLED, endedAt: new Date() } });
      if (result.count !== 1) throw new NotFoundException("Active deployment not found");
      await tx.deploymentStage.updateMany({ where: { deploymentId, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "SKIPPED", endedAt: new Date() } });
      await tx.deploymentEvent.create({ data: { deploymentId, type: "deployment.completed", payload: { deploymentId, status: "CANCELLED", reason: "Cancelled by owner" } } });
      await tx.deploymentEffect.createMany({ data: ["archive", "email", "github-status"].map(kind => ({ deploymentId, kind })), skipDuplicates: true });
    });
    return { id: deploymentId, status: DeploymentStatus.CANCELLED };
  }

  @Post("/v1/deployments/:deploymentId/retry")
  async retry(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const previous = await db.deployment.findFirst({ where: { id: deploymentId, status: { in: [DeploymentStatus.FAILED, DeploymentStatus.TIMED_OUT, DeploymentStatus.CANCELLED] }, repository: { ownerId: user.id } }, include: { repository: { include: { configs: true, environments: true, workers: true } } } });
    if (!previous) throw new NotFoundException("Failed deployment not found");
    const config = previous.repository.configs.find((item) => item.id === previous.configId);
    const environment = previous.repository.environments.find((item) => item.id === previous.environmentId);
    const worker = previous.repository.workers.find((item) => item.id === previous.targetWorkerId && !item.revokedAt);
    if (!config || !environment || !worker) throw new BadRequestException("Deployment target is no longer available");
    validateProfile(config.profile);
    if (!/^[a-f0-9]{40}$/i.test(previous.commitSha)) throw new BadRequestException("Legacy deployment has no immutable SHA; create a new deployment");
    const deployment = await db.deployment.create({ data: { repositoryId: previous.repositoryId, configId: config.id, environmentId: environment.id, targetWorkerId: worker.id, commitSha: previous.commitSha, trigger: DeploymentTrigger.RETRY, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map((name) => ({ name })) } } });
    await this.eventForWorker(deployment.id, "deployment.retry", { retriedFrom: deploymentId });
    return { id: deployment.id, status: deployment.status, commitSha: deployment.commitSha, retriedFrom: deploymentId };
  }

  @Post("/v1/deployments/:deploymentId/diagnose")
  async diagnose(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const deployment = await db.deployment.findFirst({ where: { id: deploymentId, repository: { ownerId: user.id }, status: DeploymentStatus.FAILED }, select: { id: true } });
    if (!deployment) throw new NotFoundException("Failed deployment not found");
    return this.diagnosis.diagnose(deploymentId);
  }

  @Sse("/v1/deployments/:deploymentId/events")
  async events(@Req() request: Request, @Param("deploymentId") deploymentId: string) {
    const user = await this.auth.user(request);
    const authorized = await db.deployment.findFirst({ where: { id: deploymentId, repository: { ownerId: user.id } }, select: { id: true } });
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
    if (request.headers["x-github-event"] !== "push") return { accepted: true, ignored: true };
    if (!deliveryId || !payload.repository?.id || !payload.after) throw new BadRequestException("Invalid GitHub push payload");
    const branch = branchFromRef(payload.ref);
    if (request.headers["x-github-event"] !== "push" || !branch || !/^[a-f0-9]{40}$/i.test(payload.after) || /^0+$/.test(payload.after)) return { accepted: true, ignored: true };
    return db.$transaction(async tx => {
      const inserted = await tx.webhookDelivery.createMany({ data: [{ deliveryId, event: "push" }], skipDuplicates: true });
      if (!inserted.count) return { accepted: true, duplicate: true };
      const repository = await tx.repository.findFirst({ where: { githubRepoId: String(payload.repository!.id) }, include: { configs: { orderBy: { version: "desc" } }, environments: { orderBy: { name: "asc" } }, workers: { orderBy: { createdAt: "asc" } } } });
      const config = repository?.configs.find(item => item.branchRule === branch || item.branchRule === "*");
      const environment = repository?.environments.find(item => item.name.toLowerCase() === "production");
      const worker = repository?.workers.find(item => !item.revokedAt);
      if (!repository || !config || !environment || !worker) {
        await tx.webhookDelivery.update({ where: { deliveryId }, data: { processedAt: new Date(), outcome: "ignored-incomplete-configuration" } });
        return { accepted: true, ignored: true, reason: "Push deployment requires a matching profile, Production environment, and active worker" };
      }
      validateProfile(config.profile);
      const deployment = await tx.deployment.create({ data: { repositoryId: repository.id, configId: config.id, environmentId: environment.id, targetWorkerId: worker.id, commitSha: payload.after!, trigger: DeploymentTrigger.PUSH, stages: { create: ["dependencies", "tests", "docker-build", "health-check", "deploy"].map(name => ({ name })) } } });
      await tx.webhookDelivery.update({ where: { deliveryId }, data: { processedAt: new Date(), outcome: "deployment-created:" + deployment.id } });
      return { accepted: true, deploymentId: deployment.id };
    });
  }

  @Post("/v1/repositories/:repositoryId/workers/register")
  async registerWorker(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Body() body: { name: string; version: string; maxConcurrency?: number }) {
    const user = await this.auth.user(request);
    if (!body.name || !body.version) throw new BadRequestException("name and version are required");
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id } });
    if (!repository) throw new NotFoundException("Repository not found");
    const token = createWorkerToken();
    const worker = await db.worker.create({ data: { repositoryId, name: body.name, version: body.version, tokenHash: hashWorkerToken(token), capabilities: { docker: true, maxConcurrency: 1 } } });
    return { workerId: worker.id, token, warning: "Store this token securely. It will not be shown again." };
  }

  @Get("/v1/repositories/:repositoryId/workers")
  async workers(@Req() request: Request, @Param("repositoryId") repositoryId: string) {
    const user = await this.auth.user(request);
    const repository = await db.repository.findFirst({ where: { id: repositoryId, ownerId: user.id }, select: { id: true } });
    if (!repository) throw new NotFoundException("Repository not found");
    return { workers: await db.worker.findMany({ where: { repositoryId }, select: { id: true, name: true, version: true, capabilities: true, lastSeenAt: true, revokedAt: true, createdAt: true }, orderBy: { createdAt: "desc" } }) };
  }

  @Post("/v1/workers/:workerId/revoke")
  async revokeWorker(@Req() request: Request, @Param("workerId") workerId: string) {
    const user = await this.auth.user(request);
    const worker = await db.worker.findFirst({ where: { id: workerId, repository: { ownerId: user.id } } });
    if (!worker) throw new NotFoundException("Worker not found");
    await db.worker.update({ where: { id: workerId }, data: { revokedAt: new Date() } });
    return { workerId, status: "REVOKED" };
  }

  @Post("/v1/workers/:workerId/rotate-token")
  async rotateWorkerToken(@Req() request: Request, @Param("workerId") workerId: string) {
    const user = await this.auth.user(request);
    const token = createWorkerToken();
    const result = await db.worker.updateMany({ where: { id: workerId, revokedAt: null, repository: { ownerId: user.id } }, data: { tokenHash: hashWorkerToken(token) } });
    if (!result.count) throw new NotFoundException("Active worker not found");
    return { workerId, token };
  }

  @Patch("/v1/repositories/:repositoryId/environments/:environmentId")
  async editEnvironment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Param("environmentId") environmentId: string, @Body() body: { name?: string; url?: string }) {
    const user = await this.auth.user(request);
    if (!body.name?.trim() || body.name.length > 80) throw new BadRequestException("Environment name is required, maximum 80 characters");
    if (body.url && !/^https?:\/\//.test(body.url)) throw new BadRequestException("Environment URL must use HTTP or HTTPS");
    const current = await db.environment.findFirst({ where: { id: environmentId, repositoryId, repository: { ownerId: user.id } } });
    if (!current) throw new NotFoundException("Environment not found");
    if (current.name.toLowerCase() === "production" && body.name.toLowerCase() !== "production") throw new BadRequestException("Production cannot be renamed");
    return db.environment.update({ where: { id: environmentId }, data: { name: body.name.trim(), url: body.url || null } });
  }

  @Delete("/v1/repositories/:repositoryId/environments/:environmentId")
  async deleteEnvironment(@Req() request: Request, @Param("repositoryId") repositoryId: string, @Param("environmentId") environmentId: string) {
    const user = await this.auth.user(request);
    const environment = await db.environment.findFirst({ where: { id: environmentId, repositoryId, repository: { ownerId: user.id } }, include: { _count: { select: { deployments: true } } } });
    if (!environment) throw new NotFoundException("Environment not found");
    if (environment.name.toLowerCase() === "production" || environment._count.deployments) throw new BadRequestException("Production and environments with deployment history cannot be deleted");
    await db.environment.delete({ where: { id: environmentId } });
    return { deleted: true };
  }

  @Post("/v1/workers/:workerId/heartbeat")
  async heartbeat(@Req() request: Request, @Param("workerId") workerId: string, @Body() body: { version?: string; capabilities?: { apiPolling?: boolean } }) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const worker = await db.worker.findUnique({ where: { id: workerId } });
    if (!worker || worker.revokedAt || !workerTokenMatches(token, worker.tokenHash)) throw new UnauthorizedException();
    const updated = await db.worker.update({ where: { id: workerId }, data: { lastSeenAt: new Date(), version: String(body.version ?? worker.version).slice(0, 50), ...(body.capabilities?.apiPolling === true ? { capabilities: { docker: true, apiPolling: true, maxConcurrency: 1 } } : {}) } });
    return { workerId: updated.id, status: "ONLINE", lastSeenAt: updated.lastSeenAt };
  }

  private async authenticatedWorker(request: Request, workerId: string) {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    const worker = await db.worker.findUnique({ where: { id: workerId } });
    if (!worker || worker.revokedAt || !workerTokenMatches(token, worker.tokenHash)) throw new UnauthorizedException();
    return worker;
  }

  @Post("/v1/workers/:workerId/jobs/claim")
  async claimWorkerJob(@Req() request: Request, @Param("workerId") workerId: string) {
    await this.authenticatedWorker(request, workerId);
    return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Worker" WHERE id = ${workerId} FOR UPDATE`;
    if (await tx.deployment.findFirst({ where: { targetWorkerId: workerId, status: "RUNNING" } })) return { job: null };
    const candidate = await tx.deployment.findFirst({
      where: { targetWorkerId: workerId, status: DeploymentStatus.QUEUED },
      orderBy: { createdAt: "asc" },
      include: { config: true },
    });
    if (!candidate) return { job: null };
    const claimed = await tx.deployment.updateMany({
      where: { id: candidate.id, targetWorkerId: workerId, status: DeploymentStatus.QUEUED },
      data: { status: DeploymentStatus.RUNNING, startedAt: new Date() },
    });
    if (claimed.count !== 1) return { job: null };
    await tx.deploymentEvent.create({ data: { deploymentId: candidate.id, type: "deployment.status", payload: { deploymentId: candidate.id, status: "RUNNING" } } });
    return { job: { deploymentId: candidate.id, commitSha: candidate.commitSha, profile: candidate.config.profile } };
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
  async workerStage(@Req() request: Request, @Param("workerId") workerId: string, @Param("deploymentId") deploymentId: string, @Param("stage") stage: string, @Body() body: { status?: "RUNNING" | "SUCCEEDED" | "FAILED"; message?: string }) {
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

  @Post("/v1/workers/:workerId/deployments/:deploymentId/complete")
  async completeWorkerDeployment(@Req() request: Request, @Param("workerId") workerId: string, @Param("deploymentId") deploymentId: string, @Body() body: { status?: "SUCCEEDED" | "FAILED" | "TIMED_OUT"; message?: string }) {
    await this.authenticatedWorker(request, workerId);
    const status = body.status ?? DeploymentStatus.FAILED;
    return finishDeployment(deploymentId, workerId, status, body.message ?? "Deployment " + status.toLowerCase());
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

@Module({ controllers: [AppController], providers: [AuthService, GitHubService, PrismaService, DiagnosisService, NotificationsService, DeploymentEffectsService] })
export class AppModule {}
