# Production rollout checklist

Do not treat local tests as proof of a live deployment. Record evidence for each item below on the actual staging/production hosts.

## Before rollout

- Identify the API host, frontend host, Docker worker machine, and owned domains.
- Back up the existing database. Confirm whether 0001_initial is already applied or needs a verified baseline.
- Review and apply 0002_event_sequence before starting the new API. Run prisma generate for the matching schema.
- Set exact CORS_ORIGINS on the API and exact Supabase OAuth redirects for the frontend.
- Keep database/GitHub/OpenAI keys only on the API; put only public Supabase/API settings on the web app.
- Set only the worker endpoint/ID/token on the Docker machine.
- Use a dedicated Docker host, private daemon, bounded disk, current Docker/Buildx, and explicit host egress controls.

## Start and verify

- API /health returns OK and /health/ready confirms database readiness.
- Frontend sign-in works and GET /v1/repositories returns only that user's repositories.
- Worker appears ONLINE with a current heartbeat and correct version.
- Save a profile with Dockerfile path/context, container port and HTTP health path. Older profiles require a new version.
- Deploy a known healthy repository, confirm an immutable SHA, actual streamed build output, HTTP readiness, and SUCCEEDED.
- Deploy a broken Dockerfile and confirm FAILED with the correct stage and evidence.
- Retry and confirm a new run linked by its retry event.
- Cancel a running build and confirm the worker stops, resources are cleaned, and status stays CANCELLED.
- Reload and reconnect two log viewers; verify no missing/duplicate sequence numbers.
- Test worker token rotation/revocation and recovery after the agent stops.
- Configure HTTPS /webhooks/github with a private webhook secret. Verify signature rejection, matching branch behavior and duplicate-delivery idempotency.
- Configure ingress to the worker-host loopback endpoint before presenting an environment URL as publicly available.
- Confirm backups and restoration, monitoring and alerts, image/container retention, and incident ownership.

## Services still requiring implementation or configuration

R2 logs, Resend deployment notifications, runtime secrets, promotion/recorded-image
rollback and team authorization are implemented and verified. Shared request limits,
encrypted backup/restore and operational monitoring are prepared in the current
release. Use launch-gate.md for the precise pending validation/configuration:
public routing is blocked, real organization/second-user checks remain, and the
local monitor/backup are not independent managed infrastructure. AI stays disabled.

Do not reuse stale claims from the original blueprint as launch evidence. The current implementation boundary is recorded in implementation-status.md.
