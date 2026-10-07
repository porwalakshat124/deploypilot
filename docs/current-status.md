# Current status — October 7, 2026

## Public beta scope

The owner approved the public Vercel dashboard with team-owned Docker workers. GitHub is the only login method. The dashboard is available at https://deploypilot-web.vercel.app; the API is hosted on Render and database/Auth on Supabase.

Application containers use worker-local addresses. Teams provide dedicated machines, Docker and availability. No managed compute, automatic public app URLs or stable traffic switching is included.

## Completed

- GitHub-only sign-in and account switching; App installation discovery and searchable repository selection/import.
- Team invitations, viewer/developer access checks and removal. Live two-account testing confirmed former-member denial and role restrictions.
- GitHub organization owner import and ordinary-member denial tested using the fixture organization. Enterprise SSO is deferred.
- Immutable Docker builds, HTTP health checks, ordered logs, cancellation, retry, deadlines and stale-worker recovery.
- Versioned build profiles, environment policy/approvals, encrypted runtime secrets and BuildKit build secrets.
- Runtime stop/start/restart, promotion and recorded-image rollback on the original worker.
- Eligible PR previews and signed GitHub installation/repository lifecycle events.
- Scoped artifact JSON/export and API documentation.
- Durable provider outbox; optional R2 archives, Resend notifications, bounded storage inventory and retention.
- Windows worker 1.3 setup and staged upgrade with failed-start task rollback.
- Encrypted application/Auth/Storage metadata backup, migration baseline and hosted recovery with fresh GitHub login for both test accounts. Storage binary files were not in use during that drill.
- Independent UptimeRobot monitoring and local operational/backup tools.
- Groq support chat and failure diagnosis enabled and verified live. Shared durable minute/day limits apply; there is no paid fallback.
- Public-page sitemap/robots, titles/descriptions, H1 structure, canonicals and JSON-LD. Private routes use noindex headers. Google ownership verification and a successful homepage live crawl are recorded.

## Validation boundaries

Node 22 CI includes dependency audit, migration/tenancy/atomic quota checks, unit tests, builds and real Docker verification. The Groq/SEO release passed CI and live provider/metadata checks.

Earlier bounded verification included twelve local builds, 720 HTTP checks, twenty-four restarts and twelve stop/start checks over 12.3 minutes, plus a fifteen-minute worker API soak with 300 reads at concurrency five and no errors. Hosted recovery preserved account IDs and verified tenant-scoped reads. These results do not certify unlimited capacity or adversarial isolation.

## Remaining work

1. Independent security review and fixes identified by that reviewer.
2. Broader capacity/load testing before increasing users or build concurrency beyond the tested setup.
3. Storage object-byte backup/recovery before enabling file storage, plus recurring recovery and maintenance drills.
4. Google search processing: the sitemap was submitted but its initial read failed despite HTTP 200 valid XML. Manual homepage indexing hit Google's daily quota. The owner asked to leave sitemap troubleshooting for later; Google indexing/rankings are not claimed complete.

## Optional future features

Public application ingress/TLS/traffic switching; enterprise SSO; shared registry, signed artifacts and SBOMs; managed workers; Unix automatic upgrade rollback. These are separate from the current dashboard beta.

Offsite backup ciphertext requires the original backup key. Keeping the only key copy on this PC remains the owner's chosen recovery limitation. Worker isolation requires separate trusted team hosts; a shared Docker daemon is not a hardened multi-tenant sandbox.
