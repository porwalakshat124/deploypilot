# DeployPilot

[![CI](https://github.com/porwalakshat124/deploypilot/actions/workflows/ci.yml/badge.svg)](https://github.com/porwalakshat124/deploypilot/actions/workflows/ci.yml)

**A GitHub and Docker deployment dashboard for teams running applications on their own machines.**

Import a GitHub repository, configure its Docker build, connect a dedicated worker, and follow deployment stages, logs and HTTP health checks from one dashboard. DeployPilot coordinates deployments; your team supplies the compute.

**Public beta:** [Open DeployPilot](https://deploypilot-web.vercel.app/) · [Getting started](https://deploypilot-web.vercel.app/getting-started) · [Report an issue](https://github.com/porwalakshat124/deploypilot/issues)

> Vercel hosts the dashboard. Application containers run on team-owned Docker workers and use worker-local addresses by default. Managed cloud workers, automatic public app URLs and stable traffic switching are not included. Independent security review is still outstanding before wider production use.

## Contents

- [Features](#features)
- [How deployments work](#how-deployments-work)
- [Using the public dashboard](#using-the-public-dashboard)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Connecting a worker](#connecting-a-worker)
- [Docker application requirements](#docker-application-requirements)
- [AI support and diagnosis](#ai-support-and-diagnosis)
- [Security and permissions](#security-and-permissions)
- [Operations and recovery](#operations-and-recovery)
- [Validation and deployment](#validation-and-deployment)
- [Limitations and next steps](#limitations-and-next-steps)
- [Documentation](#documentation)
- [Contributing](#contributing)

## Features

| Area | Available in this beta |
| --- | --- |
| Authentication | GitHub-only sign-in, account switching and Supabase-validated API sessions |
| Repository import | Load repositories permitted by the GitHub App, search/select repositories, then import and configure them |
| Teams | Owner, administrator, developer and viewer roles; email-bound invitation links; removal, ownership transfer and archival |
| GitHub organizations | Installation connection requires an active GitHub organization owner and a DeployPilot team administrator |
| Build profiles | Versioned Dockerfile paths, build contexts, branch rules, ports, health checks and timeouts |
| Environments | Branch/worker restrictions, separate administrator approvals and encrypted runtime/build secrets |
| Workers | Repository-scoped credentials, heartbeat/status, revocation, rotation and Windows installation/upgrade tools |
| Execution | Immutable commit snapshots, atomic job claims, cancellation, deadlines and abandoned-job recovery |
| Logs | Ordered live updates, filtering, reconnection, downloads and optional private R2 archives |
| Releases | Retry, promotion, runtime stop/start/restart and rollback to a retained image on its original worker |
| PR previews | Opt-in previews for eligible same-repository pull requests; forks and secret-bearing profiles are excluded |
| Artifacts | Downloadable JSON records covering commit, profile, environment, worker-local image and archive delivery |
| AI | Groq support chat and evidence-based failure diagnosis, with shared durable quotas and no paid fallback |
| Operations | Readiness endpoints, provider-delivery retries, monitoring, encrypted backups and bounded maintenance tools |
| Public pages | Setup guide, canonical metadata, structured data, sitemap and robots rules; private routes use noindex headers |

## How deployments work

```mermaid
flowchart LR
  User[GitHub user] --> Web[Next.js dashboard on Vercel]
  Web --> API[NestJS API on Render]
  API --> Auth[Supabase Auth]
  API --> DB[(PostgreSQL deployment state)]
  API --> GitHub[GitHub App and immutable source]
  Worker[Team-owned Docker worker] -->|Outbound HTTPS polling| API
  Worker --> Docker[BuildKit and restricted containers]
  API --> Providers[Optional R2, Resend and Groq]
```

1. The API verifies the user's GitHub session and current repository/team permissions.
2. A request resolves the branch to an immutable commit SHA and snapshots the selected configuration.
3. PostgreSQL records a durable queued deployment, including any required approval.
4. An authorized worker claims one job at a time through an atomic database transaction.
5. The worker downloads bounded source archives, builds with Docker Buildx, starts a restricted container, and checks the configured HTTP endpoint.
6. Ordered logs, stages and completion evidence return through authenticated HTTPS. The API reconciles cancellation, deadlines and worker loss.
7. Optional archive, email and GitHub-status deliveries use a durable outbox with retries.

**The active deployment queue is PostgreSQL-backed polling.** Redis/BullMQ code is retained for legacy/future integrations, but Redis is not required to run current deployments. Workers never connect directly to the database.

Install and test commands belong in the repository's Dockerfile. Their separate dashboard stages are marked `SKIPPED`, not passed. `SUCCEEDED` means the configured HTTP health check passed on the worker; it does not establish public internet access or application correctness.

## Using the public dashboard

1. Open [DeployPilot](https://deploypilot-web.vercel.app/) and sign in with GitHub.
2. Open **Repositories** and choose **Import GitHub repository**. Connect the DeployPilot GitHub App if necessary.
3. Let DeployPilot load the repositories that GitHub permits the App to access. Search/select the repository to import. If one is missing, update the App's repository access and reload.
4. Create or select your team and environment, then save a Dockerfile build profile.
5. Register a worker for that repository and install it on your team's dedicated Docker machine.
6. Choose **Configure and deploy**, select the branch/profile/environment/worker, and follow the deployment detail page.
7. Use the reported worker-local address to test the app. Your team must provide routing separately if the app should be reachable publicly.

An imported repository must satisfy the [Docker application requirements](#docker-application-requirements). Import is not automatic framework detection or a guarantee that every repository can deploy unchanged.

## Repository layout

```text
deploypilot/
├── apps/
│   ├── api/                 NestJS API, authorization and deployment control
│   ├── web/                 Next.js public pages and dashboard
│   └── worker/              Docker execution agent and healthy test fixture
├── packages/
│   ├── database/            Prisma schema, migrations and database client
│   └── shared/              Shared types and contracts
├── infra/                   Local Docker Compose configuration
├── scripts/                 Worker installation, recovery and maintenance tools
├── docs/                    Setup, API reference, operations and status
├── .github/workflows/       CI with PostgreSQL and real Docker checks
├── .env.example             Server/development configuration template
├── .env.worker.example      Worker-only configuration template
└── pnpm-lock.yaml           Authoritative dependency lockfile
```

The owner's local checkout also retains ignored archives/inputs under `.local/` and private verification evidence under `docs/verification/`. They are not dependencies and are not uploaded to GitHub. See [local workspace organization](docs/local-workspace.md).

## Local development

### Requirements

- Node.js **22.x** and pnpm **9.15.0**.
- A Supabase project with GitHub authentication configured.
- PostgreSQL reachable by the API, and your own GitHub App for repository access/webhooks.
- Docker with a Linux engine and Buildx on machines executing builds. Windows/macOS can use Docker Desktop.

### Install

```sh
git clone https://github.com/porwalakshat124/deploypilot.git
cd deploypilot
corepack enable
corepack pnpm install --frozen-lockfile
```

Copy `.env.example` to a private project-root `.env` (`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on Unix). Fill in your own values; do not copy the production server's secrets to a worker.

For local application PostgreSQL:

```sh
docker compose -f infra/docker-compose.yml up -d postgres
```

Use `postgresql://deploypilot:deploypilot@localhost:5432/deploypilot` for both database variables in this **local-only** fixture. Supabase Auth still needs its separate project configuration.

### Database and login setup

1. Copy connection strings from Supabase **Connect**. `DATABASE_URL` is the API's runtime connection; `DIRECT_URL` must support migration sessions. On an IPv4-only host, a session-pooler connection can replace an unreachable direct connection. Percent-encode reserved password characters. An HTTPS Supabase API URL is not a PostgreSQL URI.
2. For a new database, review and apply the checked-in migrations:

   ```sh
   corepack pnpm db:validate
   corepack pnpm db:migrate
   ```

   These root commands load your private root `.env` using Node 22. Direct package-level Prisma commands require the database variables to be exported separately.
3. If the database already contains application tables without migration history, use the documented [verified baseline procedure](docs/recovery.md). Do not reset a populated database or replay the initial migration blindly.
4. Enable **GitHub** in Supabase Auth using your OAuth app's client ID/secret and Supabase's callback URL. Configure the local/production Site URL and allowed `/auth/callback` redirects. Keep password/email login disabled for this GitHub-only app.
5. Configure the separate GitHub App for repository access, signed webhooks and optional pull-request events. OAuth login and repository App installation are different integrations.

Direct browser access to application tables is denied through RLS/privileges; the API handles tenant authorization. Never add permissive database policies just to bypass a setup error.

### Start development services

Use separate terminals from the repository root:

```sh
corepack pnpm --filter @deploypilot/api dev
corepack pnpm --filter @deploypilot/web dev
```

The dashboard uses `http://localhost:3000`; the API defaults to `http://localhost:4000`. Start a worker separately only after registering its credentials. The root `dev` command also starts the worker and therefore needs valid worker configuration and Docker.

## Configuration

Real values belong in private `.env` files or provider environment settings, never in source control. `.env.example` is a template, not a working credential bundle.

| Location | Variables | Purpose |
| --- | --- | --- |
| Web and API | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Auth project configuration; the API validates GitHub sessions |
| Web | `NEXT_PUBLIC_API_URL` | Control-plane endpoint; compiled into the frontend build |
| API | `DATABASE_URL`, `DIRECT_URL`, `DATABASE_CONNECTION_LIMIT` | Runtime database, migrations and bounded connection pool |
| API | `CORS_ORIGINS`, `API_PORT` or host-supplied `PORT` | Exact allowed frontend origins and listener port |
| API | `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY` or `GITHUB_PRIVATE_KEY_PATH`, `GITHUB_WEBHOOK_SECRET` | App access tokens and signed events |
| API | `ENVIRONMENT_SECRET_KEY` | Base64-encoded 32-byte AES-GCM key for environment secrets; preserve it for recovery |
| API, optional | `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Private log archives and encrypted backups |
| API, optional | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Deployment notifications using a verified sender |
| API, optional | `GROQ_API_KEY`, `GROQ_MODEL`, `AI_CHAT_ENABLED`, `AI_DIAGNOSIS_ENABLED` | Groq AI with explicit feature flags |
| Operator only | `OPERATIONS_ALERT_TOKEN`, `OPERATIONS_ALERT_EMAIL` | Restricted operations endpoints and approved operational alerts |
| Worker only | `WORKER_API_URL`, `WORKER_ID`, `WORKER_TOKEN`, optional `WORKER_BUILD_NETWORK` | Repository-scoped outbound worker connection |

`NEXT_PUBLIC_` settings are visible to the browser. Database passwords, service-role keys, GitHub private keys, Groq keys, environment encryption keys and operations tokens must never use that prefix. See [provider activation](docs/provider-activation.md) for integration setup.

## Connecting a worker

Register a worker in the dashboard, then copy its one-time credential into a private file using `.env.worker.example`. The current worker version is **1.3.0**; it advertises capabilities used for runtime controls and BuildKit secrets.

For a fresh Windows installation, from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-worker.ps1 -ConfigPath "C:\private\worker.env" -Version main
```

Choose an approved release ref/SHA for repeatable installations; the default `main` tracks current development. The installer keeps the worker in a separate runtime directory and creates a limited per-user scheduled task. Docker Desktop must be running, and the PC must remain awake, online and logged in.

For native execution on a dedicated worker checkout, store worker-only values in its root `.env`:

```sh
corepack pnpm install --filter @deploypilot/worker... --frozen-lockfile
corepack pnpm --filter @deploypilot/worker build
corepack pnpm --filter @deploypilot/worker start
```

Workers send heartbeats every 30 seconds, poll every five seconds and are considered offline after 90 seconds. Run one process per worker identity. Remote APIs require HTTPS; loopback HTTP is permitted for development.

Workers need no database, Redis, GitHub, Supabase or AI provider credentials. Never expose the Docker daemon to connect a worker. See [installation and troubleshooting](docs/worker-installation.md) and [upgrade/maintenance](docs/maintenance.md).

## Docker application requirements

- Provide a Dockerfile and build context relative to the repository root.
- Listen on `0.0.0.0` at the configured container port and expose a working HTTP health path.
- Run as UID/GID 1000 with a read-only root filesystem and writable `/tmp`.
- Do not require root, host mounts, extra capabilities or the Docker socket.
- Source archives must fit the bounded extraction policy; unsupported links/special archive entries are rejected.
- Place install/test steps inside the Dockerfile. Use BuildKit secret mounts for build credentials rather than build arguments or image layers.

The included healthy fixture uses `apps/worker/src/fixtures/healthy/Dockerfile`, context `apps/worker/src/fixtures/healthy`, port `3000`, and health path `/health`.

Build secrets are separate from runtime variables. A Dockerfile consumes a named secret with `RUN --mount=type=secret,id=NPM_TOKEN,required=true ...`. Even a secret mount cannot prevent malicious code from copying or transmitting its value: review repositories before providing credentials.

## AI support and diagnosis

- **Support chat:** answers deployment questions using only the supplied conversation. It cannot inspect accounts/repositories or execute actions. New chat clears the browser's current conversation.
- **Failure diagnosis:** an authorized deployer clicks **Diagnose failure** on a failed deployment. Groq receives up to 20 redacted log messages of 300 characters each, selected build settings and required secret names. Structured results cite actual log sequences/quotes, suggest actions and are cached.
- **Budget:** chat and diagnosis share per-user limits of 3 requests/minute and 20/day, plus global limits of 3/minute and 100/day. Daily application limits use UTC. Provider limits may be lower.
- **Provider:** `openai/gpt-oss-20b` on Groq; `openai/` here is the model name, not an OpenAI API connection. Both flags default off in the template and are enabled on the current deployment.
- **No paid fallback:** exhausted quotas return an error without switching providers or automatically retrying. Provider availability and free allowances are not guaranteed.

Redaction cannot recognize every possible secret. Avoid putting credentials in chat or application logs. AI suggestions require human review and never apply a fix automatically.

## Security and permissions

The API checks current membership on every operation. Viewers read; developers deploy and save profiles; administrators manage environments/workers and permitted membership changes; owners manage administrators and ownership. Invitations are short-lived, hashed, one-use and bound to a verified email. Removing membership revokes future access, but cannot recall downloaded data.

Workers use hashed, expiring, revocable repository-scoped tokens. Source retrieval, ordered reporting and completion are checked against their authorized deployment. Webhooks require valid signatures; database RLS blocks direct browser access. AES-GCM protects environment values and encrypted recovery backups use a separate backup key.

Docker restrictions reduce risk but **a Docker daemon is not a hardened shared sandbox for hostile tenants**. Each team must use a separate dedicated worker and trusted repositories. Independent security review is pending. Read [the security handoff](docs/security-review.md) before broader production use.

For a suspected security problem, do not put secrets or exploit details in a public issue. Use a private channel agreed with the maintainer; see [SECURITY.md](SECURITY.md).

## Operations and recovery

- Public health: [API health](https://deploypilot-i4fj.onrender.com/health) and [database readiness](https://deploypilot-i4fj.onrender.com/health/ready).
- UptimeRobot provides independent free-plan checks. Local Windows tasks additionally monitor workers, backup age and storage; those tasks depend on this PC staying available.
- Searchable logs retain 30 days and compact only after a verified R2 archive. Eligible verified compacted cloud archives expire after 90 days. Application/deployment history remains.
- Local encrypted backups retain 30 days, preserving designated minimum/latest restore-tested copies. Offsite backup/image expiration is explicit bounded operator maintenance; there is no blanket bucket purge or Docker prune.
- Rollback needs the image on the original worker. Separate releases start separate containers; stop old runtimes explicitly.
- Database/Auth/Storage **metadata** backups do not contain Storage object bytes. Add object recovery before using file storage. Provider configuration and Docker images require separate recovery planning.
- Keep the backup key and environment encryption key safe. A lost key cannot be replaced to decrypt old ciphertext.

Hosted recovery and bounded Docker/API soak checks passed for the tested setup; they do not establish arbitrary capacity or replace recurring drills. See [recovery](docs/recovery.md), [runbook](docs/PRODUCTION_RUNBOOK.md) and [current status](docs/current-status.md).

## Validation and deployment

```sh
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm audit --prod --audit-level high
```

Real Docker tests are opt-in locally (PowerShell uses `$env:DOCKER_SMOKE="1"` / `$env:DOCKER_SOAK="1"`):

```sh
DOCKER_SMOKE=1 corepack pnpm --filter @deploypilot/worker test
DOCKER_SOAK=1 corepack pnpm --filter @deploypilot/worker exec vitest run src/docker-soak.test.ts
```

GitHub Actions uses Node 22, PostgreSQL, the locked dependency graph, migration/tenancy/rate-limit checks, unit tests, type checks, production builds and Docker verification. Check the workflow for the release being deployed; historical results are not proof of current health.

Production uses **Vercel for `apps/web`**, **Render for `apps/api`**, and **Supabase for database/Auth**. Team-owned workers run outside these services. Keep production secrets in provider settings, apply reviewed additive migrations, and verify health/login/import/deployment after a release. There is no repository-wide one-click production provisioning script; follow the [production checklist](docs/production-checklist.md).

## Limitations and next steps

The public dashboard beta is available. The main outstanding work is independent security review and broader capacity/load validation before wider use. Public application routing is optional future work and remains outside the current no-domain setup. Enterprise SSO, a shared image registry, signed artifacts/SBOMs, managed compute and automatic traffic switching are not provided.

Public-page SEO and Google ownership verification are configured. Search indexing and rankings depend on Google; sitemap processing/indexing status belongs in Search Console and is not an application deployment guarantee.

## Documentation

| Guide | What it covers |
| --- | --- |
| [Documentation index](docs/README.md) | Navigation and authoritative status |
| [Current status](docs/current-status.md) | Completed verification, remaining work and beta boundaries |
| [API reference](docs/API.md) | User/worker endpoints, roles, errors and profile examples |
| [Worker installation](docs/worker-installation.md) | Windows/macOS/Linux operation and troubleshooting |
| [Multi-user operations](docs/multi-user-operations.md) | Team roles, organization access, approvals and previews |
| [Provider activation](docs/provider-activation.md) | Supabase, GitHub, Groq, R2 and Resend configuration |
| [Runbook](docs/PRODUCTION_RUNBOOK.md) | Release checks, providers, runtime and recovery |
| [Production checklist](docs/production-checklist.md) | Checks for a particular rollout |
| [Recovery](docs/recovery.md) | Encrypted backups, hosted recovery and migration baselines |
| [Maintenance](docs/maintenance.md) | Safe worker upgrades and bounded storage expiration |
| [Free operation](docs/free-operation.md) | Team-owned compute, quotas, monitoring and retention |
| [AI chat](docs/ai-chat.md) / [diagnosis](docs/ai-diagnosis.md) | Data boundaries, model, limits and configuration |
| [SEO](docs/seo.md) | Public indexing scope and Search Console setup |
| [Security review](docs/security-review.md) | Internal controls and independent-review handoff |

## Contributing

Start from current `main`, create a focused branch and open a pull request with the problem, resulting behavior and validation. Use the pnpm lockfile; do not introduce an npm lockfile. Run checks appropriate to your change and never commit credentials, user logs or backups. See [CONTRIBUTING.md](CONTRIBUTING.md).
