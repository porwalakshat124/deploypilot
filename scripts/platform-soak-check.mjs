import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.cwd(), require = createRequire(join(root, 'apps/api/package.json'));
const env = require('dotenv').parse(await readFile(join(root, '.env.worker')));
const endpoint = new URL(env.WORKER_API_URL);
if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'deploypilot-i4fj.onrender.com') throw new Error('Unexpected soak destination');
const started = Date.now(), samples = [];
for (let round = 0; round < 30; round++) {
  await new Promise(r => setTimeout(r, Math.max(0, started + round * 30000 - Date.now())));
  let next = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (next++ < 10) {
      const start = Date.now();
      try {
        const response = await fetch(`${endpoint.origin}/v1/workers/${encodeURIComponent(env.WORKER_ID)}/runtimes`, { signal: AbortSignal.timeout(20000), redirect: 'error', headers: { Authorization: `Bearer ${env.WORKER_TOKEN}` } });
        await response.body?.cancel(); samples.push({ status: response.status, durationMs: Date.now() - start, round });
      } catch { samples.push({ status: 0, durationMs: Date.now() - start, round }); }
    }
  }));
  console.log(JSON.stringify({ round: round + 1, requests: samples.length, errors: samples.filter(x => x.status !== 200).length }));
  if (samples.filter(x => x.status !== 200).length >= 5) break;
}
if (samples.length === 300) await new Promise(r => setTimeout(r, Math.max(0, started + 900000 - Date.now())));
const times = samples.map(x => x.durationMs).sort((a, b) => a - b);
const report = { checkedAt: new Date().toISOString(), elapsedMs: Date.now() - started, requests: samples.length, concurrency: 5, success: samples.filter(x => x.status === 200).length, errors: samples.filter(x => x.status !== 200), p50Ms: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)], scope: '15-minute bounded authenticated read-only worker API soak; no capacity certification' };
await writeFile(join(root, 'docs/verification/platform-soak-check.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (report.errors.length || samples.length !== 300) process.exitCode = 1;
