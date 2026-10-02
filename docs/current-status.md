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

A. A real GitHub organization installation/ownership/SSO test needs an organization;
the owner has none. Team member roles and removal were tested with both accounts.

B. A functional hosted Supabase recovery on a second trusted project/host,
Storage binary-object recovery before storing files, and broader user/build
load/soak/capacity tests. The current checks do not certify service capacity.

C. Independent security review and any resulting fixes. Internal checks and the
review packet are complete, but they are not independent review.

D. Optional automatic worker-upgrade rollback, backup-object retention, and
reference-aware Docker image cleanup. Searchable logs/local backups retain 30 days;
verified compacted R2 logs expire after 90 days for stopped/absent runtimes. Backups
and rollback images are preserved. Artifact signing/SBOM/registry uploads are
future additions, not part of the current artifact record.

E. Public application routing/domain setup remains blocked by the no-domain choice.
Vercel hosts the dashboard; team workers build/run apps locally. Wider public
launch still needs the owner's explicit approval after the launch gates pass.
