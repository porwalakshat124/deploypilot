import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { db } from "@deploypilot/database/client";
import { r2 } from "./r2.service.js";
const terminal = ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"] as const;
export async function retainLogs(now = new Date()) {
  if (!r2.configured()) return { compacted: 0 };
  const cutoff = new Date(now.getTime() - 30 * 86400000);
  const where = { status: { in: [...terminal] }, endedAt: { lt: cutoff }, effects: { some: { kind: "archive", status: "SUCCEEDED" } }, logs: { some: {} } };
  const candidates = await db.deployment.findMany({ where, select: { id: true }, orderBy: { endedAt: "asc" }, take: 10 });
  let compacted = 0;
  for (const candidate of candidates) {
    const logs = await db.deploymentLog.findMany({ where: { deploymentId: candidate.id }, orderBy: { sequence: "asc" }, take: 50001 });
    if (!logs.length || logs.length > 50000) continue;
    const archive = await r2.archiveLogs(candidate.id, logs);
    if (!archive?.verified || archive.lineCount !== logs.length) continue;
    // Serializable checks ensure a concurrent process cannot remove unarchived rows.
    const result = await db.$transaction(async tx => {
      if (!await tx.deployment.findFirst({ where: { id: candidate.id, ...where }, select: { id: true } })) return false;
      const current = await tx.deploymentLog.aggregate({ where: { deploymentId: candidate.id }, _count: true, _max: { sequence: true } });
      if (current._count !== logs.length || current._max.sequence !== logs.at(-1)!.sequence) return false;
      await tx.deploymentLog.deleteMany({ where: { deploymentId: candidate.id } });
      await tx.deploymentEvent.create({ data: { deploymentId: candidate.id, type: "logs.retained", payload: { days: 30, archiveKey: archive.key, sha256: archive.sha256, lineCount: archive.lineCount } } });
      return true;
    }, { isolationLevel: "Serializable" });
    if (result) compacted++;
  }
  return { compacted };
}
@Injectable()
export class LogRetentionService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  onModuleInit() {
    const run = async () => { if (this.busy) return; this.busy = true; try { await retainLogs(); } catch { console.error("[retention] failed; logs preserved unless archive verification succeeded"); } finally { this.busy = false; } };
    void run(); this.timer = setInterval(() => void run(), 6 * 3600000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
