# Production rollout checklist

Apply this checklist to the exact release and host configuration being deployed. Historical checks do not establish current availability.

## Before a release

- Review the changes, CI results, dependency audit and any migration.
- Back up the intended database and preserve the environment/backup encryption keys privately.
- For an existing schema without Prisma history, follow the verified baseline procedure. Never reset production or replay the initial migration blindly.
- Apply reviewed additive migrations and regenerate the matching Prisma client.
- Set exact API CORS origins, frontend API/Auth values and Supabase OAuth redirect URLs.
- Keep GitHub-only login enabled; do not enable password login unintentionally.
- Keep database, GitHub, Groq, R2, Resend and encryption credentials on the API/operator host. Workers receive only their scoped connection values.
- Ensure dedicated workers have current Docker/Buildx, bounded resources and trusted repository code.

## After a release

- Confirm /health and /health/ready return 200.
- Verify GitHub login and account switching.
- Load, select and import only repositories allowed by the GitHub App.
- Verify team role permissions, organization owner rules and cross-tenant denial.
- Confirm an authorized worker reports ONLINE with the expected version/capabilities.
- Deploy a healthy fixture and verify immutable SHA, real build logs, HTTP readiness and SUCCEEDED.
- Check failed Docker/health cases, cancellation, timeout, retry and log reconnection using scoped fixtures.
- Verify runtime stop/start/restart and recorded-image rollback when the image exists.
- Check webhook signature rejection and delivery idempotency.
- Check optional provider delivery state; missing configuration should produce skipped delivery rather than fabricated success.
- If AI is enabled, check a bounded chat/diagnosis request and quota behavior without exposing secrets.
- Verify public metadata/sitemap/robots and private-route noindex headers.
- Check monitoring, backup age, storage inventory and incident ownership.

## Current beta boundary

The public dashboard is approved and live. Team containers remain worker-local unless teams separately configure routing. Organization/two-account access and hosted GitHub Auth recovery have passed scoped tests; independent security review and broader capacity validation remain pending. Read [current status](current-status.md) for limits and [runbook](PRODUCTION_RUNBOOK.md) for operations.
