# Public beta scope and wider-launch gates

The owner approved public dashboard use on October 7, 2026 with **team-owned Docker workers**. This supersedes the earlier stop-before-launch instruction for the dashboard.

## Available now

The Vercel dashboard supports GitHub-only login, authorized repository import, teams, profiles, environments, repository-scoped workers, deployment history/logs, runtime controls and Groq AI. See [current status](current-status.md) for verified checks.

## Application access

Containers remain bound to worker-host loopback endpoints. No owned domain or DeployPilot-managed public ingress is configured. Teams may separately plan authenticated routing, DNS/TLS and traffic switching; the dashboard does not create public application URLs. Never expose the Docker daemon to bypass this boundary.

## Before wider production use

- Complete independent security review and resulting fixes.
- Establish capacity with broader authenticated user/build load and longer soak testing.
- Rehearse recovery regularly with preserved encryption keys, fresh login and tenant checks.
- Add Storage object-byte recovery before storing files; database metadata is insufficient.
- Monitor archives/images, provider quotas, backup age and worker availability.
- Keep teams on separate dedicated workers and review repository code before giving it secrets.
- Keep a documented incident owner and a private security-reporting channel.

## Existing safeguards and their limits

PostgreSQL-backed request/AI quotas, signed webhooks, durable provider deliveries, encrypted environment secrets/backups, token rotation/revocation, ordered execution evidence and restricted containers are implemented. Hosted Auth recovery and bounded Docker/API tests passed. These controls and tests are not an independent audit or a scale certification.

UptimeRobot monitors independently. Local Windows monitor/backup/inventory tasks depend on the PC being awake, online and configured. Backup ciphertext without its key is unrecoverable; the current owner keeps the key locally by choice.

Use [production checklist](production-checklist.md), [recovery](recovery.md) and [security handoff](security-review.md) for ongoing operations.
