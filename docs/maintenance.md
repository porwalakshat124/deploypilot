# Free worker maintenance

Windows upgrades use `scripts/upgrade-worker.ps1 -CurrentDir <current-checkout>`.
The script builds a sibling checkout and runs an authenticated, read-only Docker/API
preflight while the previous scheduled worker keeps running. Releases without
preflight support are rejected. `-PrepareOnly` stages and checks without switching.
After activation, startup must authenticate and report ready within 90 seconds;
otherwise the previous scheduled task is restored and restarted. Previous
checkouts are retained. This is a Windows implementation; Unix service upgrade
rollback remains manual. Schedule an upgrade when builds are idle: interrupting an
active build is not a seamless migration. The isolated Windows scheduled-task
fixture verified that a failed candidate restores and restarts the previous task.

`node scripts/maintenance.mjs` previews backup and image expiration.
`--scope=images` operates without R2 credentials; `--scope=backups` excludes Docker.
Explicit `--apply` enables bounded expiration. This is an operator CLI, not a public
API. Database/R2 configuration stays in the private local `.env`.

Remote backups retain at least seven complete sets, every locally restore-tested
set, incomplete sets and anything newer than 90 days. Expiration requires a local
restore receipt, validates both encrypted copies' checksums, and uses conditional
deletes. If the storage provider does not support conditional deletion, expiration
fails rather than falling back to unconditional deletion. Only fixed encrypted
backup keys are eligible. No encryption key is deleted.

Docker cleanup considers only images older than 90 days whose every tag is a
DeployPilot deployment UUID. All existing container images, runtime references,
successful deployments and queued/running deployments are protected. References
are refreshed before removal and Docker removal never uses `--force`. Shared,
dangling and unrelated images, containers, volumes and build caches are preserved.
No live objects were deleted during the initial zero-candidate image preview.

The opt-in Docker soak is `DOCKER_SOAK=1 pnpm --filter @deploypilot/worker exec vitest
run src/docker-soak.test.ts`. It performs six builds in two lanes, 360 HTTP health
requests, twelve restarts and six stop/start checks, cleaning only its fixture
containers/images. It does not certify production capacity or long-duration load.
