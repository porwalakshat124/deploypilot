# DeployPilot documentation

Start with the [project README](../README.md) for features, architecture, setup and operating limits. [Current status](current-status.md) is the authoritative completion/remaining-work summary; older dated audit records are historical evidence.

## Use and development

- [Public setup guide](https://deploypilot-web.vercel.app/getting-started)
- [Provider activation](provider-activation.md): Auth, database, GitHub App, Groq, R2 and Resend.
- [API reference](API.md): authenticated user and worker routes.
- [Worker installation](worker-installation.md): dedicated Docker host setup.
- [Remote worker architecture](remote-worker.md): polling, source and execution boundaries.
- [Multi-user operations](multi-user-operations.md): roles, organizations, approvals and previews.
- [AI chat](ai-chat.md) and [failure diagnosis](ai-diagnosis.md): provider data and shared quotas.

## Operate and review

- [Production runbook](PRODUCTION_RUNBOOK.md) and [rollout checklist](production-checklist.md).
- [Recovery](recovery.md): encrypted backups, hosted Auth recovery and migration baselines.
- [Maintenance](maintenance.md): upgrades, retention previews and bounded expiration.
- [Free operation](free-operation.md): worker costs, monitoring and limits.
- [Beta launch scope](launch-gate.md): dashboard availability versus public application routing.
- [Security handoff](security-review.md): independent review is still pending.
- [SEO](seo.md): metadata, crawler scope and Google verification.
- [Local workspace organization](local-workspace.md): private archived inputs and evidence.

Never publish private environment files, raw logs, backups, provider credentials or screenshots containing user data. Local verification files are deliberately excluded from Git.
