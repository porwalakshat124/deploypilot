# Launch gate — stop before public release

The owner requested preparation through the launch boundary. Public routing is
explicitly blocked: no owned domain is available. Do not expose Docker or publish
team applications to the internet to bypass this gate.

## Safeguards prepared in this release

- PostgreSQL-backed atomic request limits shared across API instances, plus
  authenticated-user limits so replacing an access token does not reset a user's
  quota. Health endpoints remain available. Limiter failures return 503.
- AES-256-GCM encrypted public/Auth/Storage metadata backups and a separately encrypted copy of
  ENVIRONMENT_SECRET_KEY. Credentials enter the PostgreSQL utility through stdin;
  no database password appears in host process arguments or Docker metadata.
- Restore drill into a fresh, network-isolated PostgreSQL 17 container, with no
  published ports. Authentication/integrity verification precedes restoration.
  The drill checks restored rows, RLS and the recovered encryption key, then removes
  only its own fixture container and temporary decrypted files.
- Private R2 backup upload with read-back checksum verification. Upload accepts
  only bounded DPB1 backup envelopes and fixed database/secret-key paths; it has a
  separate operator token and no public download endpoint.
- Operator email alerts via the configured Resend sender. Dedicated-token requests
  accept only predefined signals, never arbitrary text or recipients. Repeated
  accepted alerts are suppressed for an hour; provider failure remains retryable.
- Windows external endpoint monitor every five minutes and daily backup at 02:00.
  The tasks run as the existing user with limited privileges. This PC must be awake,
  logged in, online and running Docker. They are not independent managed services.
- Searchable logs retain 30 days and compact only after a checksum-verified R2
  archive. Verified compacted cloud logs expire after 90 days for terminal runs
  with stopped/absent runtimes. Local encrypted backups retain 30 days with seven
  newest and the latest restore-tested copy preserved. Backup objects, deployment
  history and rollback images remain preserved.

## Recovery commands

    node scripts/database-backup.mjs backup --include-managed
    node scripts/database-backup.mjs verify <private-backup-path>
    node scripts/database-backup.mjs upload <private-backup-path>
    node scripts/operations-monitor.mjs
    pnpm --filter @deploypilot/api exec tsx scripts/retention-plan.ts

Backups and their manifests are under the user's private .deploypilot-backups
directory. The independent backup.key is required to recover offsite ciphertext.
Keep a separate secure copy of that key outside this PC; never commit or email it.
The managed-schema backup covers application data, Auth identities and Storage
metadata. Storage binary objects, provider configuration and Docker images need
separate recovery. A PostgreSQL restore is not a functional hosted Supabase restore.

## Required before public launch

1. Owned domain, authenticated ingress, DNS/TLS, stable release routing and traffic
   switching. Current deployment endpoints remain loopback-only.
2. Real GitHub organization owner/App installation browser verification remains
   unavailable: the owner has no organization. Second-user invitation acceptance,
   viewer read/write denial, developer profile write and removal passed using the
   private smoke team. Broader organization/SSO cases still need a real organization.
3. Functional hosted Supabase Auth recovery and a restore drill on another trusted
   host/project remain. Encrypted public/auth/storage database metadata and the
   application encryption key passed an isolated PostgreSQL restore. Storage is
   empty; binary object recovery must be added before using it. The owner chooses
   to keep backup.key on this PC, so loss of both PC and key is an accepted recovery
   limitation rather than evidence of independent key custody.
4. Independent uptime monitoring is complete: UptimeRobot checks the API and
   frontend every five minutes, both report Up, and a notification test was sent.
5. Review R2 and Docker storage usage as data grows; cloud archives and rollback
   images are preserved, with no broad Docker prune or bucket deletion.
6. Larger authenticated user load/soak testing, region/capacity review, host egress
   policy and independent security review. A 300-request authenticated worker read
   check at concurrency five passed with p50 2.32s/p95 4.19s; it is limited evidence,
   not a scale claim. AI remains disabled by the owner's decision.

BuildKit secret mounts, artifact records/API documentation and bounded storage
inventory are implemented. Daily inventory runs at 05:00 on this PC. Local logs
and backups have retention; verified compacted R2 logs expire after 90 days.
Backup-object/image cleanup and automated worker rollback remain product improvements. Worker 1.3 was installed
alongside the preserved old checkout without adding paid hosting.

The launch gate remains closed until these requirements are evidenced and the
owner explicitly approves public launch.
