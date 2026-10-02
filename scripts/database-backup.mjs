import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, appendFile, stat, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retainBackups } from './backup-retention.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'apps/api/package.json'));
const dotenv = require('dotenv');
const env = dotenv.parse(await readFile(join(root, '.env')));
const directory = resolve(process.env.DEPLOYPILOT_BACKUP_DIR ?? join(process.env.USERPROFILE ?? root, '.deploypilot-backups'));
await mkdir(directory, { recursive: true, mode: 0o700 });
if (process.platform === 'win32') execFileSync('icacls', [directory, '/inheritance:r', '/grant:r', `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`], { stdio: 'ignore' });
const keyPath = join(directory, 'backup.key');
let key;
try { key = await readFile(keyPath); } catch (error) {
  if (error.code !== 'ENOENT' || process.argv[2] !== 'backup') throw error;
  key = randomBytes(32); await writeFile(keyPath, key, { flag: 'wx', mode: 0o600 });
}
if (key.length !== 32) throw new Error('Invalid backup encryption key');
const image = 'postgres:17';

function docker(args, input) {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', b => { stderr = (stderr + b.toString()).slice(-4000); });
  const done = new Promise((ok, fail) => {
    child.on('error', fail);
    child.on('close', code => {
      let detail = stderr.replace(/postgres(?:ql)?:\/\/\S+/g, '[database URL]');
      for (const value of Object.values(env)) if (value.length >= 8) detail = detail.split(value).join('[redacted]');
      try { detail = detail.split(decodeURIComponent(new URL(env.DATABASE_URL).password)).join('[redacted]'); } catch {}
      code === 0 ? ok() : fail(new Error('Docker PostgreSQL operation failed: ' + detail));
    });
  });
  // Keep credentials out of process arguments and Docker container metadata.
  if (input !== undefined) child.stdin.end(input);
  return { child, done };
}
async function encrypt(source, destination) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  output.write(Buffer.concat([Buffer.from('DPB1'), iv]));
  await pipeline(source, cipher, output);
  await appendFile(destination, cipher.getAuthTag());
}
async function decrypt(source, destination) {
  const info = await stat(source);
  if (info.size < 32) throw new Error('Invalid backup');
  const header = Buffer.alloc(16), tag = Buffer.alloc(16);
  const fs = await import('node:fs/promises'); const handle = await fs.open(source, 'r');
  try { await handle.read(header, 0, 16, 0); await handle.read(tag, 0, 16, info.size - 16); } finally { await handle.close(); }
  if (header.subarray(0, 4).toString() !== 'DPB1') throw new Error('Invalid backup format');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(4)); decipher.setAuthTag(tag);
  try { await pipeline(createReadStream(source, { start: 16, end: info.size - 17 }), decipher, createWriteStream(destination, { flags: 'wx', mode: 0o600 })); }
  catch (error) { await rm(destination, { force: true }); throw error; }
}
const command = process.argv[2];
async function upload(file) {
  const manifest = JSON.parse(await readFile(file + '.json', 'utf8'));
  const operations = dotenv.parse(await readFile(join(root, '.env.operations')));
  const objects = [];
  for (const [kind, path] of [['database', file], ['secret-key', manifest.secret]]) {
    const body = await readFile(path);
    const response = await fetch(`https://deploypilot-i4fj.onrender.com/v1/operations/backups/${manifest.sha256}/${kind}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { Authorization: `Bearer ${operations.OPERATIONS_ALERT_TOKEN}`, 'Content-Type': 'application/octet-stream' }, body,
    });
    if (!response.ok) throw new Error(`Encrypted offsite upload failed: HTTP ${response.status}`);
    const result = await response.json();
    if (!result.verified || result.sha256 !== createHash('sha256').update(body).digest('hex')) throw new Error('Offsite checksum verification failed');
    objects.push(result);
  }
  await writeFile(file + '.offsite.json', JSON.stringify({ uploadedAt: new Date().toISOString(), objects }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ encryptedOffsiteBackup: true, objects }));
}
if (command === 'backup') {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const url = new URL(env.DATABASE_URL);
  // Session pooler supports pg_dump; Prisma-only parameters are not libpq options.
  if (url.hostname.endsWith('.pooler.supabase.com')) url.port = '5432';
  for (const p of ['pgbouncer', 'connection_limit', 'pool_timeout']) url.searchParams.delete(p);
  url.searchParams.set('sslmode', 'require');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(directory, `public-${stamp}.dpbackup`);
  const connection = [url.hostname, url.port || '5432', decodeURIComponent(url.username), decodeURIComponent(url.password), url.pathname.slice(1), 'require'];
  if (connection.some(value => /[\r\n]/.test(value))) throw new Error('Database credentials contain unsupported line breaks');
  const includeManaged = process.argv.includes('--include-managed');
  const dumpCommand = 'IFS= read -r PGHOST; IFS= read -r PGPORT; IFS= read -r PGUSER; IFS= read -r PGPASSWORD; IFS= read -r PGDATABASE; IFS= read -r PGSSLMODE; export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE; exec pg_dump --format=custom --schema=public ' + (includeManaged ? '--schema=auth --schema=storage ' : '') + '--no-owner --no-privileges';
  const dump = docker(['run', '--rm', '-i', image, 'sh', '-c', dumpCommand], connection.join('\n') + '\n');
  try { await Promise.all([encrypt(dump.child.stdout, file), dump.done]); }
  catch (error) { await rm(file, { force: true }); throw error; }
  const secret = join(directory, `secret-key-${stamp}.dpbackup`);
  await encrypt(createReadStream(join(root, '.env.secret-key')), secret);
  const manifest = { version: 1, createdAt: new Date().toISOString(), includeManaged, scope: includeManaged ? 'public, auth and storage database schemas; Storage binary objects, provider configuration and Docker images are excluded' : 'public application schema only; Supabase Auth/Storage and Docker images require separate recovery', file, secret, sha256: createHash('sha256').update(await readFile(file)).digest('hex') };
  await writeFile(file + '.json', JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ backup: file, encrypted: true, secretKeyBackedUp: true, scope: manifest.scope }));
  try { await stat(join(root, '.env.operations')); await upload(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  console.log(JSON.stringify({retention:await retainBackups(directory)}));
} else if (command === 'upload') {
  const file = resolve(process.argv[3] ?? '');
  if (dirname(file) !== directory || !file.endsWith('.dpbackup')) throw new Error('Select a backup in the private backup directory');
  await upload(file);
} else if (command === 'verify') {
  const file = resolve(process.argv[3] ?? '');
  if (dirname(file) !== directory || !file.endsWith('.dpbackup')) throw new Error('Select an encrypted backup inside the configured private backup directory');
  const manifest = JSON.parse(await readFile(file + '.json', 'utf8'));
  if (createHash('sha256').update(await readFile(file)).digest('hex') !== manifest.sha256) throw new Error('Backup checksum mismatch');
  const work = join(directory, `verify-${randomBytes(8).toString('hex')}`);
  if (dirname(resolve(work)) !== directory) throw new Error('Restore workspace escaped the private backup directory');
  await mkdir(work, { mode: 0o700 });
  const dump = join(work, 'restore.dump'), secret = join(work, 'secret-key');
  const container = 'deploypilot-restore-' + randomBytes(8).toString('hex');
  let started = false;
  try {
    // Authenticate the entire encrypted file before sending data to pg_restore.
    await decrypt(file, dump); await decrypt(manifest.secret, secret);
    if (!(await readFile(secret)).equals(await readFile(join(root, '.env.secret-key')))) throw new Error('Secret-key restore mismatch');
    execFileSync('docker', ['run', '-d', '--name', container, '--network', 'none', '--label', 'deploypilot.fixture=restore', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image], { stdio: 'ignore' }); started = true;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { execFileSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' }); ready = true; break; } catch { await new Promise(r => setTimeout(r, 500)); }
    }
    if (!ready) throw new Error('Restore fixture did not become ready');
    // Only the freshly created, network-isolated fixture is modified.
    execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'DROP SCHEMA public;'], { stdio: 'ignore' });
    if (manifest.includeManaged) execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;'], { stdio: 'ignore' });
    const restore = docker(['exec', '-i', container, 'pg_restore', '-U', 'postgres', '-d', 'postgres', '--exit-on-error', '--no-owner', '--no-privileges']);
    await Promise.all([pipeline(createReadStream(dump), restore.child.stdin), restore.done]);
    const query = `SELECT json_build_object('users',(SELECT count(*) FROM "User"),'deployments',(SELECT count(*) FROM "Deployment"),'teams',(SELECT count(*) FROM "Team"),'secrets',(SELECT count(*) FROM "EnvironmentSecret"),'rls_enabled',NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity));`;
    const counts = JSON.parse(execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', query], { encoding: 'utf8' }).trim());
    if (!counts.rls_enabled || !counts.users || !counts.deployments) throw new Error('Restored data/RLS verification failed');
    if (manifest.includeManaged) {
      const managed = JSON.parse(execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', "SELECT json_build_object('authUsers',(SELECT count(*) FROM auth.users),'authIdentities',(SELECT count(*) FROM auth.identities),'storageBuckets',(SELECT count(*) FROM storage.buckets),'storageObjects',(SELECT count(*) FROM storage.objects));"], { encoding: 'utf8' }).trim());
      Object.assign(counts, managed);
      const orphans = Number(execFileSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', 'SELECT count(*) FROM auth.identities i WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=i.user_id);'], { encoding: 'utf8' }).trim());
      if (orphans) throw new Error('Recovered Auth identities reference missing users');
    }
    await writeFile(file + '.verified.json', JSON.stringify({ verifiedAt: new Date().toISOString(), isolated: true, secretKeyRestored: true, counts }, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ restored: true, isolated: true, secretKeyRestored: true, counts }));
  } finally {
    if (started) execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
    await rm(work, { recursive: true, force: true });
  }
} else throw new Error('Usage: node scripts/database-backup.mjs backup | verify <encrypted-file> | upload <encrypted-file>');
