import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, createDecipheriv, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const root = process.cwd();
const require = createRequire(join(root, 'apps/api/package.json'));
const env = require('dotenv').parse(await readFile(join(root, '.env')));
const ref = 'tsytatnipuuvkpulfuwy';
const url = new URL(env.RECOVERY_POSTGRES_URL);
if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    !(url.hostname === `db.${ref}.supabase.co` && decodeURIComponent(url.username) === 'postgres' ||
      url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`) ||
    url.pathname !== '/postgres' || (url.port && url.port !== '5432')) throw new Error('Recovery target rejected');
const directory = resolve(process.env.USERPROFILE, '.deploypilot-backups');
const file = resolve(process.argv[2] ?? '');
if (!file.startsWith(directory + '\\') || !file.endsWith('.dpbackup')) throw new Error('Select a private encrypted backup');
const manifest = JSON.parse(await readFile(file + '.json'));
if (!manifest.includeManaged) throw new Error('Managed-schema backup required');
const bytes = await readFile(file);
if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256 || bytes.subarray(0, 4).toString() !== 'DPB1') throw new Error('Backup integrity failed');
const key = await readFile(join(directory, 'backup.key'));
const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(4, 16));
decipher.setAuthTag(bytes.subarray(-16));
const dump = Buffer.concat([decipher.update(bytes.subarray(16, -16)), decipher.final()]);
const work = join(directory, 'hosted-' + randomBytes(8).toString('hex'));
await mkdir(work, { mode: 0o700 });
const connection = [url.hostname, url.port || '5432', decodeURIComponent(url.username), decodeURIComponent(url.password)];
if (connection.some(x => /[\r\n]/.test(x))) throw new Error('Unsupported credential characters');
const prefix = 'IFS= read -r PGHOST; IFS= read -r PGPORT; IFS= read -r PGUSER; IFS= read -r PGPASSWORD; export PGHOST PGPORT PGUSER PGPASSWORD; export PGDATABASE=postgres PGSSLMODE=require PGCONNECT_TIMEOUT=15; ';
async function docker(command, input = '') {
  const child = spawn('docker', ['run', '--rm', '-i', '--mount', `type=bind,source=${work},target=/recovery,readonly`, 'postgres:17', 'sh', '-c', command], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', b => output += b);
  child.stderr.on('data', b => error += b);
  const done = new Promise((ok, fail) => {
    child.on('error', () => fail(new Error('Docker client failed')));
    child.on('close', code => code === 0 ? ok(output) : fail(new Error('Recovery operation failed: ' + (/password authentication failed/i.test(error) ? 'authentication' : /permission denied/i.test(error) ? 'permission' : /already exists/i.test(error) ? 'object exists' : /does not exist/i.test(error) ? 'missing object' : 'database/client error'))));
  });
  child.stdin.end(input);
  return done;
}
const query = sql => docker(prefix + 'exec psql -X -v ON_ERROR_STOP=1 -Atc ' + "'" + sql.replaceAll("'", "'\"'\"'") + "'", connection.join('\n') + '\n');
try {
  await writeFile(join(work, 'restore.dump'), dump, { mode: 0o600 });
  const empty = JSON.parse((await query("SELECT json_build_object('tables',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'authUsers',(SELECT count(*) FROM auth.users),'identities',(SELECT count(*) FROM auth.identities),'storageObjects',(SELECT count(*) FROM storage.objects),'storageBuckets',(SELECT count(*) FROM storage.buckets));")).trim());
  if (Object.values(empty).some(x => x !== 0)) throw new Error('Recovery target is not empty; no writes allowed');
  const list = await docker('pg_restore -l /recovery/restore.dump');
  await writeFile(join(work, 'toc'), list.split('\n').filter(line => !/ SCHEMA - public /.test(line)).join('\n'), { mode: 0o600 });
  const appSql = await docker('pg_restore --no-owner --no-privileges --schema=public --use-list=/recovery/toc -f - /recovery/restore.dump');
  // Preserve managed Auth DDL/migration history. Restore users and identities only;
  // old sessions/refresh tokens are deliberately invalidated across projects.
  const authSql = await docker('pg_restore --no-owner --no-privileges --data-only --schema=auth --table=users --table=identities -f - /recovery/restore.dump');
  if (!/COPY auth\.users /.test(authSql) || !/COPY auth\.identities /.test(authSql) || !/CREATE TABLE public\."User"/.test(appSql)) throw new Error('Backup selection failed');
  await writeFile(join(work, 'restore.sql'), 'SET session_replication_role = replica;\n' + appSql + '\n' + authSql + '\nSET session_replication_role = origin;\n', { mode: 0o600 });
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ target: ref, empty, ready: true, writes: false })); }
  else {
    await docker(prefix + 'exec psql -X -v ON_ERROR_STOP=1 --single-transaction -f /recovery/restore.sql', connection.join('\n') + '\n');
    const counts = JSON.parse((await query(`SELECT json_build_object('users',(SELECT count(*) FROM public."User"),'teams',(SELECT count(*) FROM public."Team"),'deployments',(SELECT count(*) FROM public."Deployment"),'secrets',(SELECT count(*) FROM public."EnvironmentSecret"),'authUsers',(SELECT count(*) FROM auth.users),'identities',(SELECT count(*) FROM auth.identities),'sessions',(SELECT count(*) FROM auth.sessions),'storageObjects',(SELECT count(*) FROM storage.objects),'rlsEnabled',NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity),'orphanIdentities',(SELECT count(*) FROM auth.identities i WHERE NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=i.user_id)));`)).trim());
    const expected = JSON.parse(await readFile(file + '.verified.json')).counts;
    if (counts.users !== expected.users || counts.deployments !== expected.deployments || counts.authUsers !== expected.authUsers || counts.identities !== expected.authIdentities || counts.orphanIdentities || !counts.rlsEnabled || counts.sessions !== 0) throw new Error('Post-restore verification failed');
    const report = { restoredAt: new Date().toISOString(), target: ref, backupSha256: manifest.sha256, counts, verified: true, productionUnchanged: true, managedDdlPreserved: true, oldSessionsRestored: false, providerLoginVerified: false };
    await writeFile(join(root, 'docs/verification/hosted-recovery.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
} finally {
  // Only remove this generated, validated child of the private backup directory.
  if (resolve(work).startsWith(directory + '\\hosted-')) await rm(work, { recursive: true, force: true });
}
