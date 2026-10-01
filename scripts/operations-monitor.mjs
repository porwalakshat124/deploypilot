import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api/package.json'));
const env = require('dotenv').parse(await readFile(join(root, '.env.operations')));
const dir = join(process.env.USERPROFILE ?? root, '.deploypilot-operations');
await mkdir(dir, { recursive: true, mode: 0o700 });
const file = join(dir, 'monitor.json');
let previous = { failures: {}, pending: [] };
try { previous = JSON.parse(await readFile(file, 'utf8')); } catch {}
const checks = [
  ['API_UNAVAILABLE', 'https://deploypilot-i4fj.onrender.com/health/ready'],
  ['FRONTEND_UNAVAILABLE', 'https://deploypilot-web.vercel.app'],
];
const results = await Promise.all(checks.map(async ([code, url]) => {
  const start = Date.now();
  try { const response = await fetch(url, { signal: AbortSignal.timeout(20000) }); await response.body?.cancel(); return { code, ok: response.ok, status: response.status, durationMs: Date.now() - start }; }
  catch { return { code, ok: false, durationMs: Date.now() - start }; }
}));
const pending = new Set(previous.pending ?? []);
const failures = {};
for (const result of results) {
  failures[result.code] = result.ok ? 0 : (previous.failures[result.code] ?? 0) + 1;
  if (failures[result.code] >= 2) pending.add(result.code);
}
const backupDir = join(process.env.USERPROFILE ?? root, '.deploypilot-backups');
try {
  const manifests = (await readdir(backupDir)).filter(name => name.endsWith('.dpbackup.offsite.json'));
  const dates = await Promise.all(manifests.map(name => stat(join(backupDir, name)).then(info => info.mtimeMs)));
  if (!dates.length || Date.now() - Math.max(...dates) > 36 * 3600000) pending.add('BACKUP_STALE');
} catch { pending.add('BACKUP_STALE'); }
if (process.argv.includes('--test-alert')) pending.add('MONITOR_TEST');
let delivery = null;
if (pending.size && results.find(r => r.code === 'API_UNAVAILABLE')?.ok) {
  const response = await fetch('https://deploypilot-i4fj.onrender.com/v1/operations/alert', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${env.OPERATIONS_ALERT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ codes: [...pending] }),
  });
  if (response.ok) { delivery = await response.json(); if (delivery.sent || delivery.deduplicated) pending.clear(); }
  else delivery = { status: response.status };
}
const state = { checkedAt: new Date().toISOString(), failures, pending: [...pending], results, delivery };
await writeFile(file, JSON.stringify(state, null, 2), { mode: 0o600 });
console.log(JSON.stringify(state));
if (results.some(r => !r.ok) || pending.size) process.exitCode = 1;
