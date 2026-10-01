import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createWorkerToken() {
  return `dpw_${randomBytes(32).toString("base64url")}`;
}

export function hashWorkerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function workerTokenMatches(token: string, storedHash: string) {
  const actual = Buffer.from(hashWorkerToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function workerIsActive(worker: { revokedAt?: Date | null; tokenExpiresAt?: Date | null } | null | undefined, now = Date.now()) {
  return Boolean(worker && !worker.revokedAt && (!worker.tokenExpiresAt || worker.tokenExpiresAt.getTime() > now));
}
