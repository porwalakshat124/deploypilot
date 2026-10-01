import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api/package.json'));
const env = require('dotenv').parse(await readFile(join(root, '.env.worker')));
const endpoint = new URL(env.WORKER_API_URL);
if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'deploypilot-i4fj.onrender.com') throw new Error('Unexpected load-check destination');
const samples = [];
let index = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (index++ < 30) {
    const start = Date.now();
    try {
      const response = await fetch(`${endpoint.origin}/v1/workers/${encodeURIComponent(env.WORKER_ID)}/runtimes`, { signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${env.WORKER_TOKEN}` } });
      await response.body?.cancel(); samples.push({ status: response.status, durationMs: Date.now() - start });
    } catch { samples.push({ status: 0, durationMs: Date.now() - start }); }
  }
}));
const times = samples.map(s => s.durationMs).sort((a, b) => a - b);
const report = { checkedAt: new Date().toISOString(), requests: samples.length, concurrency: 3, success: samples.filter(s => s.status === 200).length, errors: samples.filter(s => s.status !== 200), p50Ms: times[Math.floor(times.length * .5)], p95Ms: times[Math.floor(times.length * .95)], scope: 'bounded authenticated read-only worker API check; not a production capacity certification' };
await writeFile(join(root, 'docs/verification/platform-load-check.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (report.errors.length) process.exitCode = 1;
