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
Encrypted offsite copies were verified by read-back SHA-256. No live data was restored.

This proves database recovery, not functional hosted Supabase Auth recovery.
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
No deletion is performed. Searchable logs/local backups already have 30-day
retention; preserve rollback images and cloud archives until a reference-aware
cloud retention policy is verified. Never use broad Docker prune or bucket purge.
