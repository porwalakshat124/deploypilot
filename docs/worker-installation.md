# Remote Docker worker installation

The worker runs on the same host as a Linux Docker engine. Windows and macOS can use Docker Desktop in Linux-container mode. Linux can use Docker Engine plus the Buildx plugin. Use a dedicated machine for repositories you trust.

## Prepare the machine

Install Node.js 22 and pnpm 9.15. Copy this project, then run:

    docker info
    docker buildx version
    pnpm install --frozen-lockfile
    pnpm --filter @deploypilot/worker build

Both Docker commands must succeed for the account that will run the agent. Docker access grants host-level privileges; deployed repository containers never receive the socket.

In Dashboard > Workers, select the repository and register a worker. Store only these values in the remote machine's private project-root .env, or its process environment:

    WORKER_API_URL=https://your-api.example.com
    WORKER_ID=the-registered-worker-id
    WORKER_TOKEN=the-one-time-token
    WORKER_BUILD_NETWORK=bridge

Use `.env.worker.example` for a separate worker checkout/config. The installed release reports its own version (currently 1.3.0); do not keep a stale WORKER_VERSION override. Do not copy the API server's environment file to the worker. The remote agent does not need database, Redis, GitHub App, Supabase service, Groq or other provider keys. HTTP is accepted only for a loopback API address. Keep worker credentials out of command history and source control.

Start the compiled agent:

    node apps/worker/dist/main.js

Or use:

    pnpm --filter @deploypilot/worker start

Startup verifies the Docker engine and Buildx. Heartbeats run every 30 seconds; the dashboard considers a worker offline after 90 seconds. The worker polls jobs every five seconds, one job at a time. Do not start multiple processes with the same identity. Database locking also prevents simultaneous claims for that identity.

## Windows and macOS

Start Docker Desktop before starting the agent. Windows must use Linux containers. Run the commands above in PowerShell or Terminal from the project root. For persistent operation, configure an existing process manager or a scheduled task under the same account that can run docker info. Set its working directory to the project root and its executable to the absolute Node path, with apps/worker/dist/main.js as its argument. Do not run the watch-mode development command as a production service.

## Linux service

After installation, a systemd unit can use the following template. Replace paths and account names for the actual host:

    [Unit]
    Description=DeployPilot worker
    After=network-online.target docker.service
    Wants=network-online.target

    [Service]
    Type=simple
    User=deploypilot
    WorkingDirectory=/opt/deploypilot
    EnvironmentFile=/etc/deploypilot/worker.env
    ExecStart=/usr/bin/node /opt/deploypilot/apps/worker/dist/main.js
    Restart=on-failure
    RestartSec=5
    TimeoutStopSec=90

    [Install]
    WantedBy=multi-user.target

Protect the environment file and ensure the service user can access the local Docker daemon. Inspect logs with journalctl -u deploypilot-worker. On SIGTERM/SIGINT the worker stops polling and aborts the active run.

The optional Compose linux-worker profile uses host networking to reach published loopback ports, and mounts the local socket into the trusted agent. It is Linux-only. It passes only worker credentials, not the API environment file. Native Node execution is recommended on Docker Desktop.

## First deployment

1. Apply API database migrations, including 0002_event_sequence.
2. Ensure the worker appears ONLINE.
3. Create a Dockerfile profile. For the included fixture, use container port 3000 and health path /health.
4. Select a GitHub branch, profile version, environment, and worker. The API records a resolved 40-character SHA before the job is queued.
5. Follow docker-build, health-check and deploy stages on the detail page. Dependencies/tests are SKIPPED because their execution belongs inside the Dockerfile.
6. Confirm the logs identify a running container and a worker-host loopback URL. This is not automatically a public URL.

Runtime containers execute as UID/GID 1000, with a read-only root filesystem and writable /tmp. Applications must listen on 0.0.0.0 at the configured port and work under those restrictions. Images requiring root or arbitrary host mounts are unsupported.

## Verification scenarios

Run the optional automated Docker smoke test on this host.

PowerShell:

    $env:DOCKER_SMOKE = "1"
    pnpm --filter @deploypilot/worker test

Linux/macOS:

    DOCKER_SMOKE=1 pnpm --filter @deploypilot/worker test

Then verify a real GitHub deployment:
- Healthy repository: SUCCEEDED only after HTTP readiness.
- Broken Dockerfile: FAILED, failed build stage, and actual Docker error in logs.
- Wrong health path: FAILED with container cleanup.
- Retry: creates a new run and navigates to its page.
- Cancel during build: CANCELLED remains terminal, BuildKit is removed, and no runtime container is retained.
- Disconnect/reconnect the log viewer: existing lines remain ordered and new lines replay.
- Replay a signed GitHub push delivery: only one run is created.

## Tokens, updates, and recovery

Rotate a worker token from Workers, copy the new token to the machine, and restart the process. The previous token stops working immediately. Rotate when no deployment is running because an active worker will stop when it loses API authorization. Revocation is permanent for that registration.

To upgrade, stop the process, copy the updated project, run pnpm install --frozen-lockfile and the worker build, then restart. Do not expose Docker TCP ports to make a remote worker reachable: the worker connects outbound to the API.

The API marks abandoned running jobs failed after heartbeat loss, or timed out after their configured deadline plus a 60-second recovery allowance. It does not retry execution automatically. Retry from the dashboard after inspecting the old job.

On an uncertain completion response, the worker preserves the candidate container rather than deleting a container that may already be recorded successful. Inspect the run and job-specific container manually before retrying.

Successful containers remain available for inspection. Runtime stop/start/restart and rollback to a recorded image are supported on capable workers; rollback requires the image on its original worker. Promotion rebuilds the recorded commit in the target environment. There is no automatic traffic switching or public ingress. Use bounded maintenance previews rather than pruning the entire host. See [multi-user operations](multi-user-operations.md) and [maintenance](maintenance.md).

## Troubleshooting

- Missing Dockerfile: paths are relative to repository root and case-sensitive on Linux.
- Unauthorized: check the worker ID, API URL, token, and revocation state.
- Old profile rejected: save a version with port and health-check path.
- HTTP readiness failure: inspect the container log; verify port, bind address, non-root permissions and path.
- Worker offline: check its process log, API HTTPS reachability, and Docker startup.
- Source extraction rejected: tarballs with links, special entries or extended per-file metadata are intentionally unsupported.
- Lost API connection: the worker stops active execution instead of running without control-plane contact.
- No public app: point a separately managed reverse proxy at the reported loopback port. Environment URLs are metadata, not automatic DNS or routing.
