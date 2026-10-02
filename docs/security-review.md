# Review handoff before wider launch

Status: internal checks performed; independent review is outstanding. This document
does not certify the service or replace a review by someone outside implementation.

October 2 dependency audit: production dependencies report no known advisories after
pinning Next's PostCSS to 8.5.26, Nest's Multer to 2.4.0 and Prisma config's
deepmerge-ts to 8.0.0. Prisma uses its ordinary configuration merger; schema
generation, validation, type checks and CI exercise the compatibility override.
CI rejects high-severity production dependency advisories. This registry audit
does not prove the absence of vulnerabilities or replace independent review.

Review source at the release commit and reproduce the role tests with two GitHub
users, including organization installations when an organization is available.
Examine AuthService, access.ts, teams.controller.ts, worker-auth.ts, webhook
signature/replay checks, source extraction, Docker isolation, secret transport,
completion reconciliation, operator endpoints and archive access.

Current controls: GitHub-only Auth, durable membership checks, hashed expiring
worker/invitation tokens, one-use email-bound invitations, RLS deny-direct-access
tables, API repository scopes, AES-GCM environment secrets and backups, restricted
non-root loopback-only runtimes, cancellation cleanup and signed archive access.

October 2 evidence: schema matches the Prisma datamodel; six migrations baselined;
migration history RLS enabled and SELECT denied to anon/authenticated; live tenant
role transaction rolled back; encrypted public/auth/storage metadata restored in
network-isolated PostgreSQL; 300 authenticated worker reads at concurrency 5 passed.
Real Docker build, HTTP health, stop/start/restart and BuildKit secret mounts passed.
These are bounded checks, not an adversarial security audit or capacity certificate.

Supabase advisors report 22 information notices for RLS without policies. These
tables intentionally reject direct frontend access; the API implements tenancy.
Do not add permissive policies to silence the notices. See
[RLS advisory explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
The leaked-password protection warning remains with password login disabled;
reassess it before enabling any password provider. See
[password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Outstanding review targets: cross-tenant races, GitHub organization ownership/SSO,
OAuth redirects, SSRF and Docker host egress, malicious Dockerfiles, build-secret
exfiltration, replayed/stale worker completion, provider retries, restore custody,
rate-limit bypass, dependency vulnerabilities and resource exhaustion. Workers
must run on separate team-owned hosts; a shared Docker daemon is not a strong
untrusted multi-tenant boundary. Public routing and wider launch remain blocked.
