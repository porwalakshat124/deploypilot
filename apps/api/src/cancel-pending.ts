import type { Prisma } from "@prisma/client";
/** Finish cancelled jobs and their stages/effects together under the caller's transaction. */
export async function cancelPending(tx: Prisma.TransactionClient, where: Prisma.DeploymentWhereInput, reason: string, includeRunning = false) {
  const jobs = await tx.deployment.findMany({ where: { AND: [where, { status: { in: includeRunning ? ["QUEUED", "RUNNING"] : ["QUEUED"] } }] }, select: { id: true } });
  for (const job of jobs) {
    await tx.$queryRaw`SELECT id FROM "Deployment" WHERE id = ${job.id} FOR UPDATE`;
    const changed = await tx.deployment.updateMany({ where: { id: job.id, status: { in: includeRunning ? ["QUEUED", "RUNNING"] : ["QUEUED"] } }, data: { status: "CANCELLED", endedAt: new Date() } });
    if (!changed.count) continue;
    await tx.deploymentStage.updateMany({ where: { deploymentId: job.id, status: { in: ["PENDING", "RUNNING"] } }, data: { status: "SKIPPED", endedAt: new Date() } });
    await tx.deploymentEvent.create({ data: { deploymentId: job.id, type: "deployment.completed", payload: { status: "CANCELLED", reason } } });
    await tx.deploymentEffect.createMany({ data: ["archive", "email", "github-status"].map(kind => ({ deploymentId: job.id, kind })), skipDuplicates: true });
  }
}
