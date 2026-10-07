# Security reporting

DeployPilot is a public beta with team-owned workers. Internal checks and CI do not replace independent security review; that review remains pending before wider production use.

## Report privately

Do not publish passwords, API keys, private logs, user data or working exploit details in a public issue. Arrange a private reporting channel with the maintainer before sending sensitive details. This repository does not yet advertise a dedicated security email or a guaranteed response SLA.

If GitHub offers private vulnerability reporting for this repository, use its Security tab. Do not assume that feature is enabled.

Include the affected release, component, safe reproduction steps and expected/actual behavior. Use disposable fixtures and redact identifiers as appropriate. Avoid testing other users' resources or disrupting production.

## Deployment boundaries

Use separate dedicated Docker hosts for teams and trusted repositories. Do not expose the Docker daemon or share it as a hardened hostile-tenant sandbox. Keep API/provider credentials off workers and keep all credentials out of frontend variables and commits.

Environment encryption and recovery keys are required to decrypt old data; preserve them securely. Redaction cannot detect every possible secret. AI cannot execute changes, and provider quotas do not establish security guarantees.

See [review handoff](docs/security-review.md), [multi-user operations](docs/multi-user-operations.md) and [recovery](docs/recovery.md).
