# Contributing to DeployPilot

Use Node.js 22 and pnpm 9.15.0. Start from current main and follow the README for local configuration. Copy templates into private files; never use production credentials in examples.

## Changes

1. Create a focused branch.
2. Explain the problem and the resulting behavior in the pull request.
3. Add meaningful regression coverage for behavior/security changes; documentation-only edits need link/content checks.
4. Run checks appropriate to the change: pnpm test, pnpm typecheck and pnpm build. Docker execution changes also need the opt-in real Docker tests.
5. Keep docs, API examples and configuration templates aligned with the implementation.

Use pnpm-lock.yaml; do not commit npm lockfiles, generated builds, local archives, raw customer logs, screenshots with private data, credentials or backups. Review git diff --cached before pushing.

Do not run destructive database resets, broad Docker pruning or provider deletions against production while testing. Use named fixtures and preserve existing keys/data.

For security findings, follow [SECURITY.md](SECURITY.md). Independent security review remains an outstanding launch task.
