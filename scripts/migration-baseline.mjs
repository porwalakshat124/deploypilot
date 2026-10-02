import { readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'apps/api/package.json'));
const config = require('dotenv').parse(await readFile(join(root, '.env')));
const target = new URL(config.DATABASE_URL);
if (target.hostname.endsWith('.pooler.supabase.com')) target.port = '5432';
for (const key of ['pgbouncer','connection_limit','pool_timeout']) target.searchParams.delete(key);
target.searchParams.set('sslmode', 'require');
const environment = {...process.env, DATABASE_URL:target.href, DIRECT_URL:target.href};
function prisma(args, allowAlreadyApplied = false) {
  const result = spawnSync(process.execPath, [join(root,'node_modules/prisma/build/index.js'), ...args], {cwd:root,env:environment,encoding:'utf8',timeout:120000});
  let output = (result.stdout ?? '') + (result.stderr ?? '');
  for (const value of [target.href, ...Object.values(config), decodeURIComponent(target.password)]) if (value.length >= 4) output = output.split(value).join('[redacted]');
  if (!result.error && result.status !== 0 && allowAlreadyApplied && /Error: P3008\b/.test(output)) return 'Already recorded; skipped.';
  if (result.error || result.status !== 0) throw new Error('Baseline check failed: '+output.slice(-6000));
  return output;
}
const schema = 'packages/database/schema.prisma';
console.log(prisma(['migrate','diff','--from-schema-datasource',schema,'--to-schema-datamodel',schema,'--exit-code']).trim());
if (process.argv[2] === '--apply') {
  const migrations = (await readdir(join(root,'packages/database/migrations'),{withFileTypes:true})).filter(entry=>entry.isDirectory() && /^\d+_[a-z0-9_]+$/.test(entry.name)).map(entry=>entry.name).sort();
  for (const name of migrations) {
    try { await stat(join(root,'packages/database/migrations',name,'migration.sql')); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    console.log(prisma(['migrate','resolve','--schema',schema,'--applied',name], true).trim());
  }
  console.log(prisma(['migrate','status','--schema',schema]).trim());
} else if (process.argv[2]) throw new Error('Usage: node scripts/migration-baseline.mjs [--apply]');
console.log('PASS: live Prisma-managed schema matches the checked-in datamodel. No migration SQL executed.');
