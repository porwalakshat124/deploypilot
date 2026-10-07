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
  const daily = await Promise.all(Array.from({length:10},()=>consumeRateLimit("fixture-daily",identity,3,"day")));
  assert.equal(daily.filter(Boolean).length,3,"daily limit is atomic across concurrent requests");
  const bucket = await db.rateLimitBucket.findFirstOrThrow({where:{key:rateLimitKey("fixture-daily",identity)}});
  assert.equal(bucket.windowStart.getUTCHours(),0,"daily window begins at midnight UTC");
  assert.equal(bucket.expiresAt.getTime()-bucket.windowStart.getTime(),172800000,"daily bucket survives the full daily window");
  console.log("PASS: shared atomic minute/day rate limiting, concurrency and identity/scope isolation");
} finally {
  const keys = [rateLimitKey("fixture", identity), rateLimitKey("fixture-other", identity), rateLimitKey("fixture", identity + "other"),rateLimitKey("fixture-daily",identity)];
  await db.rateLimitBucket.deleteMany({ where: { key: { in: keys } } });
  await db.$disconnect();
}
