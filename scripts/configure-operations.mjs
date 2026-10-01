import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api/package.json'));
const dotenv = require('dotenv');
Object.assign(process.env, dotenv.parse(await readFile(join(root, '.env'))));
process.env.DATABASE_CONNECTION_LIMIT = '5';
const { db } = await import('../packages/database/client.ts');
try {
  const users = await db.user.findMany({ select: { email: true } });
  if (users.length !== 1) throw new Error('Operator selection is ambiguous; configure the existing operator explicitly');
  const file = join(root, '.env.operations');
  let existing = {};
  try { existing = dotenv.parse(await readFile(file)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const values = { OPERATIONS_ALERT_TOKEN: existing.OPERATIONS_ALERT_TOKEN ?? randomBytes(32).toString('base64url'), OPERATIONS_ALERT_EMAIL: users[0].email, OPERATIONS_WORKER_ID: 'ba422329-cfce-4a3d-a927-9af551742b8b' };
  await writeFile(file, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  if (process.platform === 'win32') execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${process.env.USERDOMAIN}\\${process.env.USERNAME}:F`], { stdio: 'ignore' });
  console.log('Private operator configuration prepared; no credentials displayed.');
} finally { await db.$disconnect(); }
