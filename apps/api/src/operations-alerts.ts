import { Injectable, Controller, Get, Post, Req, Body, Param, Inject, UnauthorizedException, BadRequestException, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import type { Request } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@deploypilot/database/client";
import { r2 } from "./r2.service.js";

export function validOperationsCredential(authorization?: string) {
  const expected = process.env.OPERATIONS_ALERT_TOKEN;
  const provided = authorization?.replace(/^Bearer /, "") ?? "";
  return Boolean(expected && timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(provided).digest()));
}

export const alertCodes = ["API_UNAVAILABLE", "FRONTEND_UNAVAILABLE", "WORKER_OFFLINE", "PROVIDER_DELIVERY_FAILED", "DATABASE_UNAVAILABLE", "BACKUP_STALE", "MONITOR_TEST"] as const;

@Injectable()
export class OperationsAlerts implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private sent = new Map<string, number>();
  onModuleInit() { this.timer = setInterval(() => void this.check().catch(() => console.error("[operations] monitor unavailable")), 60000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async send(codes: string[]) {
    const key = [...new Set(codes)].sort().join(",");
    if (!key) return { sent: false };
    if (Date.now() - (this.sent.get(key) ?? 0) < 3600000) return { sent: false, deduplicated: true };
    if (!process.env.OPERATIONS_ALERT_EMAIL || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { sent: false, configured: false };
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `operations/${createHash("sha256").update(key).digest("hex")}/${Math.floor(Date.now() / 3600000)}` },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [process.env.OPERATIONS_ALERT_EMAIL], subject: "DeployPilot operations need attention", text: `Operational signals: ${key}.\nCheck the DeployPilot dashboard and production runbook.\nNo credentials or deployment logs are included.` }),
    });
    if (!response.ok) throw new Error(`Operational email failed: HTTP ${response.status}`);
    this.sent.set(key, Date.now());
    return { sent: true };
  }
  async check() {
    if (this.busy || !process.env.OPERATIONS_ALERT_EMAIL) return;
    this.busy = true;
    try {
      const codes: string[] = [];
      try {
        if (process.env.OPERATIONS_WORKER_ID) {
          const worker = await db.worker.findUnique({ where: { id: process.env.OPERATIONS_WORKER_ID }, select: { lastSeenAt: true, revokedAt: true } });
          if (!worker || worker.revokedAt || !worker.lastSeenAt || Date.now() - worker.lastSeenAt.getTime() > 180000) codes.push("WORKER_OFFLINE");
        }
        if (await db.deploymentEffect.count({ where: { status: "FAILED", createdAt: { gt: new Date(Date.now() - 86400000) } } })) codes.push("PROVIDER_DELIVERY_FAILED");
      } catch { codes.push("DATABASE_UNAVAILABLE"); }
      await this.send(codes);
    } finally { this.busy = false; }
  }
}

@Controller()
export class OperationsAlertController {
  constructor(@Inject(OperationsAlerts) private readonly alerts: OperationsAlerts) {}
  @Get("/v1/operations/storage")
  async storage(@Req() request: Request) {
    if (!validOperationsCredential(request.headers.authorization)) throw new UnauthorizedException();
    return r2.inventory();
  }
  @Post("/v1/operations/alert")
  async notify(@Req() request: Request, @Body() body: { codes?: unknown }) {
    if (!validOperationsCredential(request.headers.authorization)) throw new UnauthorizedException();
    if (!Array.isArray(body?.codes) || !body.codes.length || body.codes.length > alertCodes.length || body.codes.some(code => !alertCodes.includes(code))) throw new BadRequestException("Unsupported operational signal");
    return this.alerts.send(body.codes);
  }

  @Post("/v1/operations/backups/:backupId/:kind")
  async backup(@Req() request: Request, @Param("backupId") backupId: string, @Param("kind") kind: string, @Body() body: Buffer) {
    if (!validOperationsCredential(request.headers.authorization)) throw new UnauthorizedException();
    if (!/^[a-f0-9]{64}$/.test(backupId) || !["database", "secret-key"].includes(kind) || !Buffer.isBuffer(body) || body.length < 32 || body.length > 20 * 1024 * 1024 || body.subarray(0, 4).toString() !== "DPB1") throw new BadRequestException("Expected a bounded encrypted backup");
    return r2.encryptedBackup(backupId, kind, body);
  }
}
