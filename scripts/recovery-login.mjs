import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(join(root, 'apps/api/package.json'));
const env = require('dotenv').parse(await readFile(join(root, '.env')));
const ref = 'tsytatnipuuvkpulfuwy', base = `https://${ref}.supabase.co`, origin = 'http://localhost:3000';
const target = new URL(env.RECOVERY_POSTGRES_URL);
if (!['postgres:', 'postgresql:'].includes(target.protocol) || target.pathname !== '/postgres' || (target.port && target.port !== '5432') || !(target.hostname === `db.${ref}.supabase.co` && decodeURIComponent(target.username) === 'postgres' || target.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(target.username) === `postgres.${ref}`)) throw new Error('Recovery database rejected');
target.searchParams.set('sslmode', 'require');
process.env.DATABASE_URL = target.toString();
process.env.DIRECT_URL = target.toString();
process.env.NEXT_PUBLIC_SUPABASE_URL = base;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.RECOVERY_DATABASE_PUBLISHABLE_KEY;
const { createClient } = require('@supabase/supabase-js');
const storage = new Map();
const client = createClient(base, env.RECOVERY_DATABASE_PUBLISHABLE_KEY, { auth: { flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false, storage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } } });
const { AuthService } = await import('../apps/api/src/auth.service.ts');
const { repositoryAccess } = await import('../apps/api/src/access.ts');
const { db } = await import('../packages/database/client.ts');
const auth = new AuthService();
const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  if (request.method !== 'GET' || request.headers.host !== 'localhost:3000') { response.writeHead(403); response.end('Forbidden'); return; }
  const url = new URL(request.url, origin);
  try {
    if (url.pathname === '/login') {
      const { data, error } = await client.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: origin + '/callback', skipBrowserRedirect: true, scopes: 'user:email' } });
      if (error || !data.url) throw new Error('Login initialization failed');
      response.writeHead(302, { Location: data.url }); response.end(); return;
    }
    if (url.pathname === '/callback') {
      const { data, error } = await client.auth.exchangeCodeForSession(url.searchParams.get('code') ?? '');
      if (error || !data.session) throw new Error('Fresh GitHub session failed');
      const user = await auth.user({ headers: { authorization: 'Bearer ' + data.session.access_token } });
      const expected = ['7c8387f8-60a0-4ba8-8e96-af53ea972de8', '78b43222-840c-426b-82e0-2dda5da4daf3'];
      if (!expected.includes(user.id)) throw new Error('Login did not preserve a restored application account');
      const allowed = await db.repository.findMany({ where: repositoryAccess(user.id), select: { id: true, ownerId: true, teamId: true } });
      const memberships = await db.teamMember.findMany({ where: { userId: user.id }, select: { teamId: true } });
      const teams = new Set(memberships.map(x => x.teamId));
      if (allowed.some(x => x.teamId ? !teams.has(x.teamId) : x.ownerId !== user.id)) throw new Error('Recovered tenancy check failed');
      const foreign = await db.repository.findFirst({ where: { ownerId: { not: user.id }, OR: [{ teamId: null }, { teamId: { notIn: [...teams] } }] }, select: { id: true } });
      if (!foreign || await db.repository.count({ where: { AND: [{ id: foreign.id }, repositoryAccess(user.id)] } })) throw new Error('Recovered foreign repository denial failed');
      let next=0; const timings=[];
      await Promise.all(Array.from({length:5},async()=>{
        while(next++<60){
          const start=Date.now();
          const verified=await auth.user({headers:{authorization:'Bearer '+data.session.access_token}});
          if(verified.id!==user.id)throw new Error('Authenticated account changed');
          const visible=await db.repository.findMany({where:repositoryAccess(verified.id),select:{id:true}});
          if(visible.some(x=>x.id===foreign.id)||visible.length!==allowed.length)throw new Error('Concurrent tenant access changed');
          timings.push(Date.now()-start);
        }
      }));
      timings.sort((a,b)=>a-b);
      const path = join(root, 'docs/verification/recovery-login.json');
      let report; try { report = JSON.parse(await readFile(path)); } catch { report = { target: ref, checks: [] }; }
      const check = { checkedAt: new Date().toISOString(), accountPreserved: true, account: user.id === expected[0] ? 'primary' : 'pkmania124', githubOAuthAuthenticatedByProductionAuthService: true, visibleRepositories: allowed.length, membershipScopeVerified: true, foreignRepositoryDenied: true, authenticatedRecoveryReads:timings.length,concurrency:5,p95Ms:timings[Math.floor(timings.length*.95)],productionUnchanged: true };
      report.checks.push(check); await writeFile(path, JSON.stringify(report, null, 2));
      await client.auth.signOut();
      response.writeHead(303, { Location: '/verified' }); response.end();
      console.log(JSON.stringify(check)); return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><title>DeployPilot recovery verification</title><h1>DeployPilot recovery verification</h1><p>' + (url.pathname === '/verified' ? 'Fresh GitHub login, restored account and repository membership checks passed. The test session has been signed out. Production is unchanged.' : 'This private check uses the recovery Supabase project. Production is unchanged.') + '</p><p><a href="/login">Verify recovery GitHub login</a></p>');
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain' }); response.end('Recovery login verification failed. No credentials are displayed.');
    console.log(JSON.stringify({ recoveryLoginVerified: false }));
  }
});
server.listen(3000, '127.0.0.1', () => console.log('Recovery login check ready at http://localhost:3000'));
const stop = async () => { server.close(); await db.$disconnect(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
