# Provider setup and credential boundaries

Configure only the integrations needed for your installation. Keep private values in API/provider environment settings, not in frontend bundles, screenshots or commits. See the root .env.example and worker-only .env.worker.example.

| Integration | Required settings | Boundary |
| --- | --- | --- |
| PostgreSQL | DATABASE_URL, DIRECT_URL; optional DATABASE_CONNECTION_LIMIT | API persistence and migration sessions |
| Supabase GitHub Auth | Public project URL/anon key; OAuth client ID/secret in Supabase | GitHub-only sessions; client secret never goes to the browser |
| GitHub App | GITHUB_APP_ID, private key or private-key path, GITHUB_WEBHOOK_SECRET | Authorized repository source and signed lifecycle/push/PR events |
| Worker execution | WORKER_API_URL, WORKER_ID, WORKER_TOKEN | Dedicated repository-scoped host; current queue is PostgreSQL polling |
| Environment secrets | ENVIRONMENT_SECRET_KEY | Base64 32-byte AES-GCM key; preserve it to decrypt existing values |
| R2 | Endpoint, access key, secret key and bucket | Private archives/encrypted backups |
| Resend | RESEND_API_KEY, RESEND_FROM_EMAIL | Verified sender and provider delivery limits |
| Groq | GROQ_API_KEY, GROQ_MODEL, AI_CHAT_ENABLED, AI_DIAGNOSIS_ENABLED | Bounded chat/diagnosis on the API; no paid fallback |
| Operations | OPERATIONS_ALERT_TOKEN, approved alert email, optional worker ID | Restricted operational alerts/backup/storage access |
| Vercel | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_URL | Public frontend build configuration only |

## Database

Copy actual strings from Supabase Connect; do not guess a pooler hostname. Pooled usernames differ from direct usernames. Percent-encode reserved password characters. DIRECT_URL must support a migration session: use a reachable direct connection or a session pooler on IPv4-only hosts.

For a fresh database, review the SQL migrations, then run `corepack pnpm db:validate` and `corepack pnpm db:migrate` from the root. These commands explicitly load the private root .env; package-level Prisma commands need exported variables. Existing populated databases need schema/history inspection and a verified baseline first. RLS and browser-role privileges deliberately deny direct access; API authorization provides tenancy. Do not add broad policies to silence advisory notices.

- [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [GitHub Auth setup](https://supabase.com/docs/guides/auth/social-login/auth-github)
- [Recovery and baseline procedure](recovery.md)

## GitHub login versus repository access

GitHub OAuth through Supabase creates the sign-in session. The separately installed GitHub App grants access only to selected repositories. A successful login alone does not grant repository access.

Set the GitHub OAuth callback to the callback shown by Supabase. Configure the dashboard Site URL and allowed /auth/callback redirects in Supabase. Enable GitHub and leave password/email login disabled.

For the repository App, use the API's HTTPS /webhooks/github endpoint and matching webhook secret. Enable the events needed for push automation, installation/repository lifecycle and optional pull-request previews. Repository code/metadata/PR access is read-only; commit-status/deployment delivery uses the applicable write permissions. Organization connection also requires an active organization owner and a DeployPilot team administrator; transient read:org authorization is used to verify membership.

## Optional providers

Enable Groq features explicitly only after configuring a working key. Chat and diagnosis share application quotas; provider quotas can be stricter. Redaction is not complete secret detection. See [chat](ai-chat.md) and [diagnosis](ai-diagnosis.md).

R2/Resend use durable provider deliveries with bounded retry. Missing configuration is reported as skipped. Verify the sender, bucket permissions and a scoped delivery rather than treating a populated variable as proof of successful delivery.

Redis/BullMQ is retained legacy integration code, not a prerequisite for the current deployment path. OpenAI is not used by the current Groq chat/diagnosis implementation.
