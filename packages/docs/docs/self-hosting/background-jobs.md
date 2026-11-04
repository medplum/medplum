---
sidebar_position: 203
---

# Background job storage

Medplum uses BullMQ for background work. Redis remains the default queue backend. You can opt into PostgreSQL queue storage for self-hosted deployments with the `backgroundJobs` setting. Redis is still required for other server features, including caching, rate limiting, and pub/sub.

## Configure PostgreSQL

Add `backgroundJobs` to the JSON server configuration. Store the connection string as a secret and use a PostgreSQL database reachable by every Medplum server instance:

```json
{
  "backgroundJobs": {
    "backend": "postgres",
    "postgres": {
      "connectionString": "postgres://medplum_jobs:secret@db.example.com:5432/medplum_jobs",
      "maxConnections": 16
    }
  }
}
```

`maxConnections` limits the shared connection pool and defaults to `32`. BullMQ uses pool connections for queue notifications, so leave room for notification listeners and concurrent queue queries when sizing the pool and PostgreSQL's connection limit. The queue database can be separate from Medplum's FHIR database.

The server runs BullMQ's advisory-lock-protected schema migrations during startup. The configured PostgreSQL role must be allowed to create and update the queue tables and related schema objects. Keep those migration privileges available to the role used at startup.

For environment-based configuration, provide the JSON value as `MEDPLUM_BACKGROUND_JOBS`, for example:

```bash
export MEDPLUM_BACKGROUND_JOBS='{"backend":"postgres","postgres":{"connectionString":"postgres://medplum_jobs:secret@db.example.com:5432/medplum_jobs","maxConnections":16}}'
```

Use your deployment's secret manager for the connection string. See [Setting Medplum Server Configuration](./setting-configuration) for configuration sources and precedence.

## Cutover and operations

Changing the backend does not copy queued, delayed, or recurring jobs. Before switching, stop scheduling new work and let the old Redis queues drain; then deploy all server instances with the same PostgreSQL queue configuration. Recreate recurring schedules after the switch. Do not run a mixed deployment where instances use different queue backends.

Back up the PostgreSQL queue data along with your database recovery plan. Set BullMQ job retention to fit your storage and operational needs, and monitor PostgreSQL connections, queue processing, and the server's `/healthcheck` endpoint, which reports queue storage health. Medplum does not make resource writes and queue enqueues one atomic transaction, so a database restore or interrupted workflow can leave related work out of sync.

On shutdown, allow the server's normal graceful shutdown to close workers, queues, and the PostgreSQL pool before terminating its process. Apply your usual database access controls and backup retention policies to queue data, which can contain job payloads.

## Run the PostgreSQL backend tests

From `packages/server`, set `MEDPLUM_TEST_QUEUE_DATABASE_URL` to a dedicated test database. These tests run BullMQ migrations and create and remove queues and jobs, so do not point them at a production database. Optionally set `MEDPLUM_TEST_QUEUE_REDIS_URL` to an isolated Redis test database to run the Redis backend smoke test too:

```bash
MEDPLUM_TEST_QUEUE_DATABASE_URL='postgres://medplum:secret@localhost:5432/medplum_queue_test' \
MEDPLUM_TEST_QUEUE_REDIS_URL='redis://:secret@localhost:6379/10' \
bunx vitest run --config vite.postgres.config.ts
```
