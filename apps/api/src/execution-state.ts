import { BadRequestException, NotFoundException } from "@nestjs/common";
import { db } from "@deploypilot/database/client";
import { redactSecretValues } from "./environment-secrets.js";
import { redactLog } from "./diagnosis-context.js";

export async function appendLogs(deploymentId: string, input: { stage: string; level: string; message: string }[]) {
  if (!input.length || input.length > 50 || input.some(item => typeof item.message !== "string" || typeof item.stage !== "string" || typeof item.level !== "string")) throw new BadRequestException("Provide between 1 and 50 log entries");
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Deployment" WHERE id = ${deploymentId} FOR UPDATE`;
    const deployment = await tx.deployment.findFirst({ where: { id: deploymentId, status: "RUNNING" } });
    if (!deployment) throw new NotFoundException("Deployment is no longer running");
    const last = await tx.deploymentLog.findFirst({ where: { deploymentId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const createdAt = new Date();
    const entries = input.map((item, index) => ({ deploymentId, sequence: (last?.sequence ?? 0) + index + 1, stage: item.stage.slice(0, 64), level: item.level.slice(0, 16), message: redactLog(redactSecretValues(item.message, deployment.secretSnapshot)).slice(0, 8000), createdAt }));
    await tx.deploymentLog.createMany({ data: entries });
    await tx.deploymentEvent.createMany({ data: entries.map(({ sequence, stage, level, message }) => ({ deploymentId, type: "log.appended", payload: { sequence, stage, level, message, createdAt: createdAt.toISOString() } })) });
  });
}

export async function appendLog(deploymentId: string, stage: string, level: string, input: string) {
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Deployment" WHERE id = ${deploymentId} FOR UPDATE`;
    const deployment = await tx.deployment.findFirst({ where: { id: deploymentId, status: "RUNNING" } });
    if (!deployment) throw new NotFoundException("Deployment is no longer running");
    const message = redactLog(redactSecretValues(input, deployment.secretSnapshot)).slice(0, 8000);
    const last = await tx.deploymentLog.findFirst({ where: { deploymentId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const log = await tx.deploymentLog.create({ data: { deploymentId, sequence, stage, level, message } });
    await tx.deploymentEvent.create({ data: { deploymentId, type: "log.appended", payload: { sequence, stage, level, message, createdAt: log.createdAt.toISOString() } } });
  });
}
export async function finishDeployment(deploymentId: string, workerId: string, status: "SUCCEEDED" | "FAILED" | "TIMED_OUT", input: string, endpoint?: string, imageId?: string) {
  if (imageId && !/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new BadRequestException("Invalid immutable image ID");
  if (endpoint && !/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(endpoint)) throw new BadRequestException("Runtime endpoint must be a worker loopback address");
  if (!["SUCCEEDED", "FAILED", "TIMED_OUT"].includes(status)) throw new BadRequestException("Invalid terminal status");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Deployment" WHERE id = ${deploymentId} FOR UPDATE`;
    const deployment = await tx.deployment.findFirst({ where: { id: deploymentId, targetWorkerId: workerId }, include: { stages: true } });
    if (!deployment) throw new NotFoundException("Deployment not found");
    if (deployment.status === status) return { deploymentId, status };
    if (deployment.status !== "RUNNING") throw new NotFoundException("Deployment is no longer running");
    if (status === "SUCCEEDED" && !["docker-build", "health-check", "deploy"].every(name => deployment.stages.some(stage => stage.name === name && stage.status === "SUCCEEDED"))) throw new BadRequestException("Required stages have not succeeded");
    const message = redactLog(redactSecretValues(input, deployment.secretSnapshot)).slice(0, 8000);
    const last = await tx.deploymentLog.findFirst({ where: { deploymentId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
    const sequence = (last?.sequence ?? 0) + 1;
    const level = status === "SUCCEEDED" ? "info" : "error";
    await tx.deploymentLog.create({ data: { deploymentId, sequence, stage: "system", level, message } });
    await tx.deploymentEvent.create({ data: { deploymentId, type: "log.appended", payload: { sequence, stage: "system", level, message } } });
    if (status !== "SUCCEEDED") {
      await tx.deploymentStage.updateMany({ where: { deploymentId, status: "RUNNING" }, data: { status: "FAILED", endedAt: new Date() } });
      await tx.deploymentStage.updateMany({ where: { deploymentId, status: "PENDING" }, data: { status: "SKIPPED", endedAt: new Date() } });
    }
    await tx.deploymentEvent.create({ data: { deploymentId, type: "deployment.completed", payload: { deploymentId, status, message } } });
    await tx.deployment.update({ where: { id: deploymentId }, data: { status, endedAt: new Date() } });
    if (status === "SUCCEEDED" && endpoint) await tx.deploymentRuntime.upsert({ where: { deploymentId }, update: {}, create: { deploymentId, workerId, endpoint, imageId, state: "HEALTHY", observedAt: new Date() } });
    await tx.deploymentEffect.createMany({ data: ["archive", "email", "github-status"].map(kind => ({ deploymentId, kind })), skipDuplicates: true });
    return { deploymentId, status };
  });
}
