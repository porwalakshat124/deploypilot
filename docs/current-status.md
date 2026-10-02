# Current status — October 2, 2026

## Completed and verified

- GitHub repository discovery fixed and verified for the second account.
- Live invitation acceptance with matching GitHub identity, viewer read access and
  API rejection of profile writes, developer profile save, then membership removal
  and former-member deployment read denial.
  The test repository remains in the smoke team; its temporary worker is revoked
  and runtime stopped. No invitation email was sent.
- Prisma datamodel parity and all six existing SQL migrations baselined without
  replaying SQL. Migration metadata denies anon/authenticated read access.
- Encrypted Auth/public/Storage metadata backup, verified R2 copies and isolated
  PostgreSQL recovery of Auth users/identities, application rows, RLS and key.
- Real Docker build/health/stop/start/restart, BuildKit secret mount and absence of
  that mount in the resulting runtime. Output suppression and runtime/build secret
  separation have regression coverage. Secret profiles are excluded from previews.
- Worker 1.3 running on the existing free Windows host with old checkout preserved.
- 300 authenticated worker API reads, concurrency five, zero errors; p50 2.32s,
  p95 4.19s. Full Node 22 CI passed before deployment.
- Scoped artifact JSON records and API reference. Bounded operator R2 inventory
  works; monitored prefixes total 1,418,438 bytes. Docker images total 1.661 GB.
- Dashboard/API readiness checks pass. Public app routing remains disabled.
- Production dependency audit reports no known advisories after patched transitive
  dependency overrides; CI rejects high-severity production advisories.

## Remaining launch work

A. DeployPilot-Test-Org owner installation and private repository import passed.
pkmania124 was confirmed as an ordinary GitHub organization member; its import
attempt was rejected and the organization repository remained absent from its
DeployPilot account. Owner/member/pending-owner rules have regression coverage.
Enterprise SSO testing remains deferred on the free budget.

B. A functional hosted Supabase recovery on a second trusted project/host,
Storage binary-object recovery before storing files, and broader user/build
load/soak/capacity tests. Six real local Docker builds in two lanes, 360 health
requests, twelve restarts and six stop/start checks passed. The latest 300 worker
API reads passed with zero errors (p95 3.21 seconds). These bounded checks do not
certify service capacity. Recovery still needs a valid privately configured
RECOVERY_POSTGRES_URL for the existing recovery project; its HTTPS API URL is not
a PostgreSQL connection string.

C. Independent security review and any resulting fixes. Internal checks and the
review packet are complete, but they are not independent review.

D. Windows upgrade staging, authenticated read-only preflight and automatic task
rollback are implemented; failed-start rollback was verified using a separate
scheduled-task fixture. Backup-object expiration and reference-aware Docker image
cleanup are implemented as explicit operator maintenance, with policy tests.
Docker preview found zero candidates and deleted nothing. Remote expiration needs
R2 credentials privately configured locally; live deletion remains unverified.
Unix upgrade rollback remains manual. Searchable logs/local backups retain 30 days;
verified compacted R2 logs expire after 90 days for stopped/absent runtimes. Backups
and rollback images are preserved. Artifact signing/SBOM/registry uploads are
future additions, not part of the current artifact record.

E. Public application routing/domain setup remains blocked by the no-domain choice.
Vercel hosts the dashboard; team workers build/run apps locally. Wider public
launch still needs the owner's explicit approval after the launch gates pass.
