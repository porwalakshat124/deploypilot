# DeployPilot

DeployPilot connects GitHub repositories to Docker workers on machines you control. The Next.js dashboard uses a NestJS API and PostgreSQL. A worker downloads an immutable GitHub commit over authenticated HTTPS, builds an image, starts a restricted container, and reports live logs and HTTP health-check results.

## Current execution model

Remote agents poll durable QUEUED deployment rows through the API. Claims are transactional and limited to one running job per worker identity. Redis/BullMQ code remains in the repository for future background services, but deployment execution no longer adds jobs to an unconsumed BullMQ queue. Remote workers need no database, Redis, GitHub, Supabase, or OpenAI credentials.

Dockerfile install/test steps run inside the build. Their separate dashboard stages are marked SKIPPED; the worker never fabricates test success. SUCCEEDED means the container passed its configured HTTP health check on the worker host. Public ingress and environment URL routing must be configured separately.

## Setup

Use Node.js 22, pnpm 9.15, and a Linux Docker engine with Buildx on the worker. Use pnpm and the checked-in pnpm lockfile for this workspace.

1. Copy .env.example to a private .env and configure Supabase Auth, PostgreSQL, GitHub App, and API/web URLs.
2. Install dependencies: pnpm install --frozen-lockfile.
3. Review and apply the migrations to the intended database: pnpm --filter @deploypilot/database exec prisma migrate deploy --schema schema.prisma.
4. Start the API: pnpm --filter @deploypilot/api dev.
5. Start the web app: pnpm --filter @deploypilot/web dev.
6. Sign in with GitHub. Synchronize your personal GitHub App installation on Repositories.
7. Create an environment, register a worker, and copy its one-time credential to that worker's environment.
8. Follow [worker installation](docs/worker-installation.md). Create a profile with the real Dockerfile path, build context, container port, and HTTP health-check path, then deploy.

For local PostgreSQL, run docker compose -f infra/docker-compose.yml up -d postgres. The API container's Compose configuration uses this database. Supabase Auth remains a separate configured service.

For an existing database originally created with prisma db push, inspect its schema and migration history before baselining 0001_initial. Do not reset the database or blindly mark migrations applied. Migration 0002_event_sequence must be applied before this version's API is started.

## Validation

- pnpm test: unit and regression tests, including source safety, worker cancellation, terminal states, authorization, log redaction, and SSE parsing.
- pnpm typecheck: all application TypeScript checks.
- pnpm build: API, worker, and production Next.js build.
- Set DOCKER_SMOKE=1 and run pnpm --filter @deploypilot/worker test on a Docker host for the real BuildKit/container/HTTP smoke test. It is skipped by default.
- GitHub Actions runs checks and the Docker smoke test on Linux.

The current workspace was verified with 68 passing tests, API/worker TypeScript builds, and a successful Next.js production build. Docker execution, hosted migrations, GitHub OAuth, and live production deployments were not verified on this machine.

## Runtime boundaries

Builds use a disposable Docker-container BuildKit builder with CPU and memory limits. Runtime containers have CPU/memory/PID limits, UID/GID 1000, a read-only root filesystem, a bounded /tmp, no added capabilities, no host volumes, and no mounted Docker socket. The trusted worker still has daemon access; use a dedicated machine for trusted repositories. This is not a hardened public multi-tenant sandbox. Build-time PID/egress isolation beyond BuildKit and host network controls still requires infrastructure policy.

The runtime port is bound to a random worker-host loopback port. The worker log reports that endpoint. Successful containers are retained; failed/cancelled job resources and source directories are cleaned up. Rollouts do not replace previous successful containers or perform automatic rollback. Configure ingress and retention before production use.

Source tarballs are capped at 50 MiB compressed and 256 MiB unpacked. Links, special files, path traversal, and extended per-file archive metadata are rejected. Repositories using unsupported archive entries need adaptation before deployment.

## Operations

- [Remote worker setup and troubleshooting](docs/worker-installation.md)
- [Implementation status and remaining work](docs/implementation-status.md)
- [Production checklist](docs/production-checklist.md)

Production requires explicit CORS_ORIGINS. Keep provider secrets server-side. Worker credentials are hashed, revocable, and rotatable. The API uses authorization-scoped queries, signed webhooks, redacted logs, request IDs, and an in-memory request limiter. Use shared ingress limits for multiple API replicas.

AI diagnosis uses the server's OPENAI_API_KEY and OPENAI_MODEL, redacted evidence, bounded output, and cached structured results. It is optional. R2 archives, Resend notifications and GitHub commit-status delivery use a durable retrying outbox. Optional providers require private configuration. Secret injection, teams, approvals and public ingress remain separate work; see the status document for the boundary.
