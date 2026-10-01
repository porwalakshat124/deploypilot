import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";

type ArchiveLog = { sequence: number; stage: string; level: string; message: string; createdAt: Date };

export class R2Service {
  private get bucket() { return process.env.R2_BUCKET; }
  private client: S3Client | null = null;
  configured() {
    if (!this.client && process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY) this.client = new S3Client({ endpoint: process.env.R2_ENDPOINT, region: "auto", maxAttempts: 2, requestHandler: { requestTimeout: 15000, connectionTimeout: 5000 }, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
    return Boolean(this.client && this.bucket);
  }

  async archiveLogs(deploymentId: string, logs: ArchiveLog[]) {
    if (!this.configured() || !this.client || !this.bucket) return null;
    const key = `deployments/${deploymentId}/logs.jsonl`;
    const body = logs.map((log) => JSON.stringify({ ...log, createdAt: log.createdAt.toISOString() })).join("\n") + (logs.length ? "\n" : "");
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: "application/x-ndjson", Metadata: { deploymentId, lineCount: String(logs.length) } }));
    return { key, lineCount: logs.length };
  }

  async signedLogUrl(deploymentId: string) {
    if (!this.configured() || !this.client || !this.bucket) return null;
    const key = `deployments/${deploymentId}/logs.jsonl`;
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: `attachment; filename="deploypilot-${deploymentId}-logs.jsonl"` }), { expiresIn: 900 });
  }

  async encryptedBackup(backupId: string, kind: string, body: Buffer) {
    if (!this.configured() || !this.client || !this.bucket) throw new Error("R2 is not configured");
    const key = `backups/${backupId}/${kind}.dpbackup`;
    const sha256 = createHash("sha256").update(body).digest("hex");
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: "application/octet-stream", Metadata: { sha256, encrypted: "aes-256-gcm" } }));
    const stored = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await stored.Body?.transformToByteArray();
    if (!bytes || createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("Offsite backup verification failed");
    return { key, size: body.length, sha256, verified: true };
  }
}

export const r2 = new R2Service();
