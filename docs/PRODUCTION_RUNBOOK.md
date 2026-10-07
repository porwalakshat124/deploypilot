# DeployPilot production runbook

The dashboard runs on Vercel, the API on Render, and PostgreSQL/Auth on Supabase. The Windows worker runs Docker Desktop's Linux engine. The remote execution protocol in release 1.2 uses authenticated outbound HTTPS polling and immutable source archives. Old BullMQ agents must be upgraded; they cannot execute jobs created by this API.

## Release order

Apply the additive event-sequence and deployment-effects migrations first. Existing schema is already deployed: do not rerun the initial migration. The hosted database uses Supabase migration tracking. Keep browser access revoked and RLS enabled; application authorization lives in the API and its private database role.

Deploy the API and web from the same GitHub release. Render retains PORT, WEB_ORIGIN, database, GitHub App and provider credentials. CORS_ORIGINS overrides WEB_ORIGIN when set. Readiness is /health/ready; /ready remains compatible. Confirm both endpoints return HTTP 200.

Create or rotate a worker credential. Save WORKER_API_URL, WORKER_ID, WORKER_TOKEN and WORKER_VERSION in a private worker-only .env file. Run scripts/install-worker.ps1 with -ConfigPath and a release branch/tag/SHA via -Version. This installs a limited per-user scheduled task that starts at login and restarts the agent after failure. The PC must remain awake and Docker Desktop must be running. Never give the worker database, Redis or provider credentials.

## Verification

Use a separate Verification environment and the healthy Docker fixture profile: Dockerfile apps/worker/src/fixtures/healthy/Dockerfile, context apps/worker/src/fixtures/healthy, port 3000, health path /health. Pin the release commit. Test healthy execution, bad Dockerfile, unhealthy HTTP response, timeout, cancellation while running, retry and signed webhook deduplication. Verify logs reconnect without repeats. Historical success labels from the old worker do not establish real application health.

Three formerly abandoned RUNNING jobs were recovered as TIMED_OUT during the rollout checks. No history was erased.

## Provider delivery

Terminal completion creates durable archive, email and GitHub-status delivery records. The API processes them every ten seconds, retries failures up to five times with backoff, and recovers abandoned claims. Provider errors do not invalidate a healthy deployment. Missing optional configuration produces SKIPPED delivery records. Resend uses a deployment/status idempotency key.

R2 needs R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET. Resend needs RESEND_API_KEY and RESEND_FROM_EMAIL with a verified sender. Groq needs GROQ_API_KEY, GROQ_MODEL and explicit AI_CHAT_ENABLED/AI_DIAGNOSIS_ENABLED flags. Chat and diagnosis share durable quotas with no paid fallback. Provider values stay private on Render. Inspect DeploymentEffect for delivery state and redacted failure summaries.

## Runtime boundary

Successful containers are retained on the worker's loopback interface. A public domain requires an ingress/tunnel and DNS configured for that machine. Do not expose the Docker daemon. Container port/HTTP health settings are mandatory. Workspaces and failed/cancelled containers/builders are cleaned up. Review successful container retention and replacement before long-running production workloads.

## Recovery and rollback

Check /health/ready, Docker Desktop readiness, worker heartbeat and the deployment's stored stages/logs. The API recovers offline/deadline-exceeded RUNNING jobs. Do not manually mark a build successful. Keep the previous application release available; the additive database migrations remain compatible with it. Rolling the control plane back requires restoring the corresponding legacy worker protocol too.

Docker runtime-socket repair during this release preserved the old runtime directory as run.deploypilot-backup-20260930; no image/volume data was removed.

## Launch preparation

See [current status](current-status.md) and [beta launch scope](launch-gate.md) for operating boundaries. The public dashboard beta is approved; application routing remains outside this no-domain setup. Operator configuration lives in the ignored, ACL-protected .env.operations; configure-operations.mjs selects the single existing account and installed worker. If the database has multiple users, select the authorized operator explicitly rather than guessing. Never upload backup.key with encrypted offsite files.
