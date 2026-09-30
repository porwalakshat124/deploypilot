# Remote worker architecture

See [worker installation](worker-installation.md) for the authoritative current setup.

The API authorizes source access and owns PostgreSQL state. The agent has only an HTTPS API endpoint and a revocable worker token. It claims durable database jobs atomically, downloads a pinned GitHub archive, builds via a disposable bounded BuildKit builder, runs a restricted container, verifies HTTP health, and reports ordered logs/events. Cancellation is polled during execution. Terminal state and final evidence are committed transactionally.

The earlier BullMQ producer was not connected to the polling worker. Deployment creation now relies on database polling as its durable queue, so Redis failure cannot leave an otherwise accepted job stranded between queue systems. Redis dependencies and the old QueueService remain available for future asynchronous integrations and are not part of the active deployment path.
