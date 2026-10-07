# Local workspace organization

The active repository remains at C:\Users\aksha\Downloads\deploypilot. Keeping its path stable preserves development tools and existing operation references.

The cleanup consolidated the former deploypilot-live-reference and deploypilot-verification-source checkouts into .local/archives/, prerequisites into .local/inputs/, old frontend ZIP/npm lockfile into .local/artifacts/, a downloaded deployment log into .local/logs/, and dated local status reports into .local/history/. No source, key, backup or log was deleted.

.local/ is ignored by Git. It can contain embedded Git checkouts and private files; never add it with git add -f. The cleanup manifest lists preserved source/destination paths locally.

Private screenshots, raw test output and operator evidence remain in docs/verification/ to preserve existing local references, and that directory is ignored. Its contents are not required to build or use DeployPilot.

The root .env files remain private and in place. Separately installed worker runtime directories and backup stores outside Downloads were not moved. The repository uses only pnpm-lock.yaml; archived ZIP/npm artifacts are not part of the current build.

For a fresh clone, .local/ and private verification data do not exist and are not needed. See the [README](../README.md) and [configuration templates](../.env.example) for setup.
