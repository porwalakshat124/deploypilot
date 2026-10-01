# Launch gate — stop before public release

The owner requested preparation through the launch boundary. Public routing is
explicitly blocked: no owned domain is available. Do not expose Docker or publish
team applications to the internet to bypass this gate.

## Safeguards prepared in this release

- PostgreSQL-backed atomic request limits shared across API instances, plus
  authenticated-user limits so replacing an access token does not reset a user's
  quota. Health endpoints remain available. Limiter failures return 503.
- AES-256-GCM encrypted public-schema backups and a separately encrypted copy of
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
  archive. Local encrypted backups retain 30 days with seven newest and the latest
  restore-tested copy preserved. R2 archives, history and Docker images remain.

## Recovery commands

    node scripts/database-backup.mjs backup
    node scripts/database-backup.mjs verify <private-backup-path>
    node scripts/database-backup.mjs upload <private-backup-path>
    node scripts/operations-monitor.mjs
    pnpm --filter @deploypilot/api exec tsx scripts/retention-plan.ts

Backups and their manifests are under the user's private .deploypilot-backups
directory. The independent backup.key is required to recover offsite ciphertext.
Keep a separate secure copy of that key outside this PC; never commit or email it.
Backup recovery covers the public application schema. Supabase Auth identities,
Storage objects, provider configuration and local Docker images need their own
recovery plan. A public-schema restore is not a full Supabase project restore.

## Required before public launch

1. Owned domain, authenticated ingress, DNS/TLS, stable release routing and traffic
   switching. Current deployment endpoints remain loopback-only.
2. Real second-user invitation/role/removal and real GitHub organization owner/App
   installation browser verification. Automated database authorization checks do
   not replace these identity-provider checks.
3. Secure external custody of backup.key, Supabase Auth recovery procedure and a
   restore drill using the offsite recovery materials on another trusted host.
4. Independent uptime monitoring is complete: UptimeRobot checks the API and
   frontend every five minutes, both report Up, and a notification test was sent.
5. Review R2 and Docker storage usage as data grows; cloud archives and rollback
   images are preserved, with no broad Docker prune or bucket deletion.
6. Larger authenticated user load/soak testing, region/capacity review, host egress
   policy and independent security review. A 120-request read-only check is limited
   evidence, not a scale claim. AI remains disabled by the owner's decision.

The launch gate remains closed until these requirements are evidenced and the
owner explicitly approves public launch.
