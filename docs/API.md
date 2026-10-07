# DeployPilot API

Base URL: https://deploypilot-i4fj.onrender.com. JSON requests use Content-Type:
application/json. User requests require Authorization: Bearer with the current
Supabase access token obtained through GitHub login. Never paste tokens into URLs
or publish them in examples. Membership and role are checked against the database
on each operation; a previous token does not preserve removed team access.

| Area | Routes | Access |
| --- | --- | --- |
| Health | GET /health, /health/ready | Public; ready includes dependency readiness |
| GitHub discovery | GET /v1/github/installation; GET /v1/github/installations/:id/available-repositories | Verified user/owner and installation; lists permitted repositories without importing |
| GitHub import | POST /v1/github/installations/:id/repositories with repositoryIds; legacy GET /v1/github/installations/:id/repositories synchronizes all permitted repositories | Verified owner and installation/team binding; legacy GET performs synchronization |
| Repositories | GET /v1/repositories; GET /v1/repositories/:id/setup, /branches, /dockerfiles | Member read; setup includes canDeploy |
| Build profiles | POST /v1/repositories/:id/configs | Developer/admin/owner; immutable versions |
| Environments/secrets | POST /v1/repositories/:id/environments; GET/POST/DELETE /v1/environments/:id/secrets | Administrator/owner; secret values never returned |
| Deploy | POST /v1/repositories/:id/deployments | Developer/admin/owner; resolves immutable SHA |
| History/details | GET /v1/repositories/:id/deployments; GET /v1/deployments/:id | Member read; pages of 25 |
| Artifact record | GET /v1/deployments/:id/artifacts | Member read; source SHA, profile version, environment, worker-local image ID, archive delivery status |
| Logs | GET /v1/deployments/:id/logs; POST /v1/deployments/:id/logs/archive | Member read; cursor pagination and short-lived archive URL |
| Release/runtime | POST /v1/deployments/:id/retry, /cancel, /promote, /rollback; GET /v1/deployments/:id/runtime | Mutations require deploy role; approval requires a separate administrator |
| Teams | GET/POST /v1/teams; GET /v1/teams/:id; POST /v1/teams/:id/invites; POST /v1/team-invites/accept | Owner/admin manage invitations; acceptance requires matching verified email |
| Membership | PATCH/DELETE /v1/teams/:id/members/:userId | Owner/admin with role restrictions; removal revokes owned team worker credentials |
| Workers | POST /v1/repositories/:id/workers/register; GET /v1/repositories/:id/workers | Administrator/owner for credentials; separate repository-scoped worker bearer |
| Worker transport | POST /v1/workers/:id/heartbeat, /jobs/claim; deployment source/stage/log/complete routes | Matching unexpired/unrevoked worker credential; never user JWT |
| Operator storage | GET /v1/operations/storage | Dedicated operations token; bounded R2 aggregate inventory, no object keys or deletion |
| AI support | GET /v1/ai/status; POST /v1/ai/chat | Verified GitHub user; bounded conversation and shared durable AI quota |
| Failure diagnosis | POST /v1/deployments/:id/diagnose | Deploy role, failed deployment; bounded redacted Groq evidence and shared AI quota |

Cross-tenant resources return 404. Invalid input returns 400; missing/invalid
authentication returns 401. Request limits return 429 and infrastructure failures
can return 503. Preserve the request ID displayed by the frontend for investigation.
Do not blindly retry deployment creation after a lost response; check history first.

Example immutable profile body (secret names only; values are saved separately):

```json
{"branchRule":"main","profile":{"strategy":"DOCKERFILE","dockerfilePath":"Dockerfile","dockerContext":".","port":3000,"healthcheckPath":"/health","timeoutSeconds":900,"requiredSecretNames":["DATABASE_URL"],"buildSecretNames":["NPM_TOKEN"]}}
```

Build secrets require a worker advertising buildSecrets (version 1.3). Dockerfiles
consume them using RUN --mount=type=secret,id=NPM_TOKEN,required=true. They are sent
through the build process environment to BuildKit mounts, never build arguments
or automatic runtime environment variables. Output is suppressed for these runs.
A Dockerfile can still deliberately copy or transmit its secrets; review code
before granting production credentials. Secret profiles are excluded from PR previews.

Artifact records do not imply registry upload, signing, SBOM generation, image
availability, public routing, or verified software supply-chain provenance.
