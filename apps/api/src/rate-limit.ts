import { createHash } from "node:crypto";
import { db } from "@deploypilot/database/client";

export function rateLimitKey(scope: string, identity: string) {
  return createHash("sha256").update(scope + ":" + identity).digest("hex");
}

// The database clock and atomic upsert enforce the same window across instances.
export async function consumeRateLimit(scope: string, identity: string, limit: number) {
  const key = rateLimitKey(scope, identity);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "expiresAt")
    VALUES (${key}, date_trunc('minute', CURRENT_TIMESTAMP), 1, date_trunc('minute', CURRENT_TIMESTAMP) + interval '2 minutes')
    ON CONFLICT ("key", "windowStart") DO UPDATE
      SET "count" = "RateLimitBucket"."count" + 1
      WHERE "RateLimitBucket"."count" < ${limit}
    RETURNING "count"
  `;
  return rows.length === 1;
}
