import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
dotenv.config({ path: new URL("../../../.env", import.meta.url) });
process.env.DATABASE_CONNECTION_LIMIT ??= "5";
const { consumeRateLimit, rateLimitKey } = await import("../src/rate-limit.js");
const { db } = await import("@deploypilot/database/client");
const identity = randomUUID();
try {
  const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimit("fixture", identity, 5)));
  assert.equal(results.filter(Boolean).length, 5, "atomic limit permits exactly five concurrent requests");
  assert.equal(await consumeRateLimit("fixture-other", identity, 5), true, "scope isolation");
  assert.equal(await consumeRateLimit("fixture", identity + "other", 5), true, "identity isolation");
  assert.equal(await consumeRateLimit("fixture", identity, 5), false, "limit persists across calls");
  console.log("PASS: shared atomic rate limiting, concurrency and identity/scope isolation");
} finally {
  const keys = [rateLimitKey("fixture", identity), rateLimitKey("fixture-other", identity), rateLimitKey("fixture", identity + "other")];
  await db.rateLimitBucket.deleteMany({ where: { key: { in: keys } } });
  await db.$disconnect();
}
