# Multi-user operations

DeployPilot uses team-owned Docker workers. The API and frontend are shared; each
team supplies dedicated build hosts. A worker credential is restricted to one
repository and cannot claim another repository's jobs.

## Roles and onboarding

Create a team in **Teams**, then connect a personal GitHub repository. Its existing
profiles, environments, workers and history remain attached. Repository assignment
gives team members access to existing logs; review those logs before sharing.
Assignment is intentionally one-way in this release.

Viewers read repository data. Developers also save build profiles, deploy, retry
and cancel. Administrators manage environments, worker credentials and developer/
viewer membership. The owner also manages administrators. There is one owner;
ownership transfer requires acceptance by an existing administrator. Owners can archive and restore a team after stopping recorded runtimes and finishing builds. Archival revokes workers and invitations and retains history.

Invitation links are issued for a specific verified email, expire after seven days,
are stored as SHA-256 digests and can be redeemed once. Copy and share the link
yourself; DeployPilot does not automatically send invitation emails. Revoking an
invitation invalidates it. Existing members retain their role when redeeming an
older invitation. Access changes are recorded in the team's audit history.

Removing a member immediately excludes them from new API queries and closes their
event stream on its next poll. Worker credentials last issued by that member for
the team are revoked. Rotate other shared credentials if they were disclosed to
that member. Previously downloaded logs and previously issued short-lived R2 URLs
cannot be recalled.

## Environment controls

Allowed branches are exact names; an empty list allows all profile-matching
branches. Allowed workers must belong to the repository. Restricting branches also
requires manual SHA requests to match the current allowed branch head.

Team environments can require a different administrator to approve a manual run.
Push runs also wait for an administrator. Pending approvals remain queued but
cannot be claimed by workers. The worker claim checks the current policy again:
incompatible targets are cancelled and newly required approvals are held. Existing
pending approvals are not silently released when a policy is relaxed.

## Worker credentials and costs

New and rotated tokens expire after 1–365 days (default 90). Existing installed
credentials remain valid until explicitly rotated or revoked; no surprise expiry
was added to the current Windows worker. Expired tokens cannot heartbeat, claim,
fetch source or report execution. Each worker's latest 25 runs are available in
Workers. Keep each team's Docker daemon and machine separate from other teams.

Bring-your-own-worker removes managed build-compute charges from DeployPilot.
Shared API, database, log storage and email usage still consume provider capacity.
Windows login startup requires an awake, signed-in PC and Docker Desktop's Linux
engine. Public application ingress, DNS and TLS are host-operator responsibilities.

## Operations and notifications

Queue shows up to 100 active runs. Administrators also see up to 50 outstanding R2,
Resend and GitHub deliveries. A failed delivery can be requeued after correcting its
provider configuration; existing provider idempotency and object keys are retained.

Result email goes to the personal repository owner or current team owner, according
to that person's All / Failures / Off setting. It is never routed to a removed
original repository owner through the old ownership field.

## Database and validation

Migration 0004 is additive and was applied through Supabase's migration tracker.
New application tables have RLS enabled and browser-role privileges revoked; only
the authenticated API reads or writes them. The API queries current membership
instead of relying on stale JWT role claims.

CI provisions disposable PostgreSQL 17, applies the complete Prisma migration
chain, and runs tenant/approval queries using fixtures rolled back in one transaction.
The same rollback test can run with the configured database:

    pnpm --filter @deploypilot/api exec tsx scripts/verify-tenancy.ts

Do not run ci-roles.sql against Supabase. Do not run Prisma migrate deploy against
the existing production database until its older Supabase-applied migrations have
been baselined and a restore-tested backup is available.

## Runtime secrets and releases

Administrators save environment secrets through a write-only form. AES-256-GCM
encrypts values with environment/name binding and a fresh nonce. The API requires
ENVIRONMENT_SECRET_KEY (a base64-encoded 32-byte key). Back up this key securely
alongside encrypted database backups; losing it prevents decryption. Key rotation
and re-encryption are not implemented in this release.

Build profiles name required runtime secrets. Queuing captures encrypted values;
updating a secret affects future runs. Worker 1.2 receives values over authenticated
HTTPS and injects them into Docker through its local socket/Windows named pipe.
Values are not placed in CLI arguments, build arguments or temporary env files.
Docker stores runtime environment values in container metadata; the worker host
operator can inspect them. Use dedicated trusted hosts for each team. Container
output is suppressed for runs using secrets; API logs also redact known values.

Successful runs record the immutable Docker image ID and a loopback endpoint.
Runtime health is polled every 15 seconds; stale observations are labelled.
Developers can queue stop, start and restart commands. Leases retry up to three
attempts and stale acknowledgments cannot complete a newer lease.

Promotion rebuilds the recorded commit and profile in another environment,
using its secrets and approvals. Rollback creates a run from a recorded immutable
image on its original worker. The image must still exist locally. Each release
starts a separate container; stop previous runs explicitly. There is no public
ingress, stable traffic switching or shared image registry yet.

## GitHub lifecycle and previews

Organization installation connection requires both a DeployPilot team
administrator and verified active GitHub organization owner. The GitHub OAuth
provider token is checked transiently, never stored by the API. Use the
organization authorization button to grant read:org when connecting.

Installations are bound to their connecting team/account. Sync paginates selected
repositories and archives repositories whose App access was removed. Repository
disconnect/restore retains history; restoration rechecks GitHub access and
requires newly registered workers. Signed lifecycle events handle installation
suspension/removal and repository removal, rename and transfer.

PR previews are opt-in per repository. They require the App pull_request
subscription/read permission, a matching branch profile or *, and a 1.2 worker.
Forks and profiles requiring secrets are excluded. Previews use separate
Preview PR #N environments and respect their branch/worker/approval policy.
Closing a PR cancels its active runs and queues stops for its recorded containers.
Preview endpoints remain worker-local.

Migration 0005 adds lifecycle fields and runtime tables with RLS/browser access
revoked. CI also verifies archival access and ownership/command lease invariants.

## Current beta and remaining work

The public dashboard beta is approved with team-owned workers. Log retention,
durable shared rate limits, hosted recovery and independent uptime monitoring are
implemented; scoped organization and two-account role tests passed. Groq chat and
failure diagnosis are enabled with shared free quotas. Independent security review
and broader capacity validation remain. Public routing/TLS and traffic switching
are optional separate work. See [current status](current-status.md).

## Database pool tuning

DATABASE_CONNECTION_LIMIT overrides the connection_limit URL parameter without
changing credentials. It accepts integers 1–20; production currently uses 5.
The previous single-connection pool exhausted its wait queue during concurrent
worker and dashboard requests (Prisma P2024). Keep the total across API instances
within the database/pooler budget when scaling. This setting does not eliminate
cross-region database latency.
