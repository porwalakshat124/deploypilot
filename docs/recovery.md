# Recovery evidence and procedure

Run `node scripts/database-backup.mjs backup --include-managed` for an AES-GCM
encrypted custom PostgreSQL dump of public, auth and storage schemas. The private
manifest identifies the exact scope. Storage binary objects, provider settings,
OAuth credentials, secrets outside ENVIRONMENT_SECRET_KEY, and Docker images are
excluded. Daily Windows backup now uses this flag. Keep backup.key as the owner
has chosen; losing both this PC and the key makes offsite ciphertext unrecoverable.

Verify with `node scripts/database-backup.mjs verify <encrypted-file>`.
Authentication and checksum checks precede restore. The drill uses fresh PostgreSQL
17 with network disabled and no ports; it checks Auth identities, application rows,
RLS and the encryption key, then removes its fixture and decrypted temporary files.
October 2 drill restored 2 application users, 2 Auth users, 2 identities, 47
deployments, 3 teams and 2 encrypted secrets. Storage has no buckets or objects.
Encrypted offsite copies were verified by read-back SHA-256. That isolated drill
did not restore into a hosted database.

This proves database recovery, not functional hosted Supabase Auth recovery.
An additional hosted database drill on October 2 restored the verified encrypted
backup into the previously empty deploypilot-recovery-test project. Application
reads, both secret decryptions, Auth users/identities, RLS and Auth health passed.
Managed Auth DDL/migrations were preserved and old sessions were not restored.
The dedicated recovery GitHub provider is configured. Fresh GitHub login passed
for porwalakshat124 and pkmania124 with original application IDs preserved and
foreign repository access denied. Both accounts completed sixty authenticated
repository reads at concurrency five (p95 4.33s and 3.68s respectively). Test
sessions were signed out; Email login is disabled on the recovery project.
Evidence: docs/verification/recovery-login.json and recovery login screenshots.
Evidence: docs/verification/hosted-recovery.json. The production project was unchanged.
`node scripts/hosted-recovery.mjs <encrypted-file>` previews a restore;
`--apply` permits writes only to the hardcoded recovery project while it is empty.
It intentionally rejects this now-populated recovery target rather than overwriting it.
For the fresh GitHub login drill, configure a separate OAuth app with the recovery
project's callback, enable only the intended provider and keep the client secret
private. Run `pnpm --filter @deploypilot/api exec tsx ../../scripts/recovery-login.mjs`
and open http://localhost:3000. The recovery project currently uses that Site URL.
The fixture listens only on loopback, authenticates through the actual AuthService,
checks preserved account IDs and foreign-repository denial, then exercises sixty
authenticated scoped reads at concurrency five and signs the test session out.
It does not start the API queue, workers or provider deliveries. Stop the fixture
after verification. Evidence is written only after these checks pass.
The October 2 extended local build soak passed twelve builds, 720 HTTP checks,
twenty-four restarts and twelve stop/start checks over 12.3 minutes. A separate
fifteen-minute worker API soak passed 300 authenticated reads at concurrency five,
with no errors (p95 5.88 seconds). These are bounded tests on the current free
setup, not a capacity guarantee. Run `node scripts/platform-soak-check.mjs` for
the capped API soak; `DOCKER_SOAK=1 DOCKER_SOAK_CYCLES=6` selects the extended
local Vitest fixture. Production queue writes and customer code are excluded.
For a real outage, create a compatible Supabase project, restore through its
supported migration procedure, reconfigure GitHub provider/callbacks and application
URLs privately, require fresh login, and verify both identities and tenant access
before switching service configuration. Never replay old sessions as proof of login.
Follow [Supabase backup/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
Do not restore managed schema DDL blindly into a different Supabase release.

Before adding Storage files, add object backup/restore and compare object hashes;
database metadata does not contain object bytes. Test service recovery on a separate
trusted host/project before treating hosted Auth/Storage disaster recovery as complete.

For an existing database without Prisma history, run
`node scripts/migration-baseline.mjs` first. After inspecting migration intent,
use `--apply` only if the script's datamodel equality check passes. It records
existing SQL migration names and safely skips records already applied; it does not
execute SQL or verify non-Prisma objects, RLS, triggers or historical data effects.
The live six migrations are now recorded. After metadata table creation, enable
RLS on public._prisma_migrations and revoke all privileges from PUBLIC, anon and
authenticated. Use ordinary migrate deploy for subsequent versioned SQL changes.

Storage monitoring: `node scripts/storage-inventory.mjs` reads bounded R2 usage
aggregates and Docker system df. Truncated groups are lower bounds, not full usage.
The inventory command performs no deletion. Searchable logs/local backups retain
30 days. A separate API task expires verified compacted cloud log archives after
90 days, only for terminal deployments with stopped/absent runtimes. Failed cloud
deletions remain retryable and expired archives return 410. Backups and rollback
images remain preserved. Never use broad Docker prune or bucket purge.
