# Free operation and repository import

The dashboard stays on https://deploypilot-web.vercel.app. No domain purchase or
paid worker service is introduced. Public app routing remains disabled.

## Import and deploy

Sign in with GitHub, open Repositories, and select **Load my GitHub repositories**.
For a new account, connect DeployPilot(AP) and select repositories on GitHub;
return and load them. Personal installation discovery verifies the immutable
GitHub account ID. Organizations still require an owner and a team administrator.

After loading, search/select the repositories to import. Choose Configure and deploy.
A supported Dockerfile/build profile, environment and capable Docker worker are required
(current release 1.3; build secrets require 1.3). Repository import does not
provide automatic configuration for every framework or free cloud compute.
Each team supplies its own worker; the existing Windows worker is free to operate
but requires the PC, Docker and Internet to stay available. Containers currently
use worker-local addresses, so an imported app is not automatically public.

GitHub is the only enabled Supabase login provider. API requests also require a
Supabase-validated OAuth session with a GitHub identity; password sessions with a
linked GitHub account are rejected.

## Monitoring

UptimeRobot independent HTTP monitors run every five minutes on the free plan:

- API readiness: https://deploypilot-i4fj.onrender.com/health/ready
- Frontend: https://deploypilot-web.vercel.app

The owner receives uptime alerts without depending on this PC or the Render API.
The existing local monitor and Resend worker/provider alerts remain useful for
worker availability and backup age. Render cold starts can delay responses.

## Retention

- Searchable database logs: 30 days after a deployment finishes. A full R2 upload
  and SHA-256 readback must succeed before compaction. Eligibility and row counts
  are checked again in a serializable transaction; history and audit events stay.
- R2 log archives: verified compacted archives expire after 90 days only when
  their runtime is absent or stopped. Encrypted offsite backups remain preserved;
  no blanket bucket lifecycle deletion is enabled. Monitor storage as data grows.
- Local encrypted backups: 30 days, preserving at least seven newest copies, the
  newest restore-tested copy and copies without verified offsite receipts. The
  backup encryption key is never removed by retention.
- Docker images: preserved for rollback. No blanket prune is scheduled on a
  team-owned Docker host. Operators should remove obsolete DeployPilot images
  only after identifying the images required by retained releases.

The backup key currently remains on the owner's PC by choice. Offsite ciphertext
cannot be recovered after PC/key loss without another secure key copy.

## Verification and launch boundary

The bounded read-only load check issued 120 authenticated worker API requests at
concurrency 5: all succeeded, p50 2289 ms and p95 2758 ms. This checks modest
concurrency, not production capacity for an arbitrary number of users.

Scoped second-account/team-role/removal checks and organization owner/member tests
passed, and the owner approved the public dashboard beta. Independent security review
and broader capacity validation remain. Groq chat/diagnosis share bounded application
and provider quotas with no paid fallback. Free provider plans have availability and
quota constraints; hardware, electricity and internet remain the team's responsibility.
See [current status](current-status.md).
