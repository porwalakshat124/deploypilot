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
ownership transfer and team deletion are not available yet.

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

## Features still requiring further implementation

Encrypted user-secret delivery into containers; promotion and runtime rollback;
continuous runtime inventory/health and stop controls; organization GitHub App
lifecycle management; artifact and log retention; distributed rate limits; backup
restore drills and external alerting. AI remains disabled at the owner's request.
These are separate from the verified team authorization and Docker build path.
