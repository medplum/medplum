---
sidebar_position: 100
---

# Database Sharding

Medplum supports horizontal database sharding, allowing FHIR resource data to be distributed across multiple PostgreSQL databases. Each Medplum [Project](/docs/administration/projects) is assigned to exactly one shard, and all resource operations for that project are routed to the corresponding database and Redis instances.

This document covers the design decisions, architecture, and operational implications of the sharding implementation.

## Motivation

A single-database Medplum deployment works well for many use cases, but large-scale deployments can encounter limits:

- **Storage and IOPS ceilings** on a single PostgreSQL instance
- **Noisy neighbor effects** where one project's data distribution and/or workload degrades performance for others
- **Compliance or data residency requirements** that mandate certain projects' data live in specific databases or regions
- **One-size-fits-all search indexing** where every project pays the cost of every search parameter, even those it never uses

Sharding addresses these by letting operators distribute projects across independent database backends while preserving a unified API surface. Because each shard has its own database, operators gain the freedom to tailor search parameters per shard — adding custom parameters for specific workloads or disabling unused ones to reduce index overhead.

## Core Concepts

### Shard Identity

Every shard has a string identifier. The built-in **global shard** always exists and has the reserved ID `global`. Additional shards are defined in the server configuration with operator-chosen IDs (e.g., `shard-1`, `us-east`, `tenant-acme`).

A project's shard assignment is stored on the `Project` resource in the `shard` field:

```json
{
  "resourceType": "Project",
  "id": "example-project-id",
  "name": "Acme Health",
  "shard": [{ "id": "shard-1" }]
}
```

When sharding is disabled (the default), all operations route to the global shard transparently. Enabling sharding is strictly additive — existing data on the global shard continues to work without migration.

### Resource Classification

Not all resource types are treated equally in a sharded deployment. Resources fall into three categories:

| Category          | Where they live                                | Examples                                                                                                       |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Global-only**   | Global shard exclusively                       | `Login`, `DomainConfiguration`, `JsonWebKey`                                                                   |
| **Synced**        | Project shard (primary) + replicated to global | `Project`, `User`, `ClientApplication`, `ProjectMembership`, `SmartAppLaunch`, `UserSecurityRequest`, `Binary` |
| **Project-local** | Project shard exclusively                      | All other FHIR resources (`Patient`, `Observation`, etc.)                                                      |

**Global-only resources** are system-level resources that have no project affiliation. They always live on the global shard regardless of configuration.

**Synced resources** are the key to making authentication work before the target shard is known. During request authentication, the server must look up some of `ClientApplication`, `SmartAppLaunch`, `User`, `ProjectMembership`, and `Project` to determine which shard to route to. These resources are replicated from project shards to the global shard via an asynchronous sync mechanism (described below), so the auth layer can always resolve them from a single known location. Other resource types accessible from unauthenticated endpoints where a shard is not known are similarly synced; including `UserSecurityRequest` and `Binary`.

**Project-local resources** are the bulk of clinical and operational data. They exist only on the project's assigned shard.

## Architecture

### Request Lifecycle

The following describes how a typical authenticated API request flows through the sharded system:

1. **Authentication**: The OAuth middleware validates the access token and looks up the `Login`, `ProjectMembership`, and `Project` — all from the **global shard** (where synced copies exist).

2. **Shard resolution**: `getProjectAndProjectShardId()` reads the project's `shard[0].id` to determine the target shard. This value is stored in `AuthState.shardId` for the duration of the request.

3. **Repository construction**: A `Repository` is created with `shardId` in its context. All database operations performed by this repository use the shard-specific connection pool.

4. **Query execution**: `getDatabasePool(mode, shardId)` routes to the correct PostgreSQL connection pool. `getCacheRedis(shardId)` and `getRateLimitRedis(shardId)` route to the correct Redis instances.

5. **Background jobs**: When the request triggers background work (subscriptions, bot execution, downloads), the `shardId` is included in the job payload so workers connect to the correct shard.

### Connection Pool Management

Each shard gets its own PostgreSQL connection pool (and optionally a separate read-replica pool). Pools are initialized at server startup based on the configuration:

```
┌──────────────────────────────────────────────────────┐
│                   Medplum Server                     │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Global Pools │  │ Shard-1 Pools│  │Shard-2 ... │  │
│  │  writer      │  │  writer      │  │  writer    │  │
│  │  readonly    │  │  readonly    │  │  readonly  │  │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  │
└─────────┼──────────────────┼────────────────┼────────┘
          │                  │                │
          ▼                  ▼                ▼
   ┌──────────┐      ┌──────────┐     ┌──────────┐
   │ Global   │      │ Shard-1  │     │ Shard-2  │
   │ Postgres │      │ Postgres │     │ Postgres │
   └──────────┘      └──────────┘     └──────────┘
```

Connection pools are instances of `DefaultShardPool`, which extends the standard `pg.Pool` with a `shardId` property. Every connection checked out from the pool carries its `shardId`, enabling downstream code to verify it is operating on the expected shard.

### Redis Per Shard

Each shard can have independent Redis instances for different purposes:

- **Default**: General-purpose Redis
- **Cache**: Resource cache (read-through caching of FHIR resources)
- **Rate limit**: Per-shard rate limiting and resource quotas
- **PubSub**: WebSocket subscription event channels
- **Background jobs**: BullMQ queue storage

All Redis getters accept a `shardId` parameter and fall back to the shard's default Redis instance if a purpose-specific one is not configured.

### Schema Migrations

Each shard database runs the same schema migration sequence independently. Migrations use PostgreSQL advisory locks to ensure only one server instance migrates a given shard at a time. All shards converge to the same schema version.

## Shard Sync

The shard sync mechanism keeps synced resource types replicated from project shards to the global shard. This is critical for authentication to work — the server needs to read `Project`, `User`, and `ProjectMembership` from the global shard before it knows which shard to route to.

### Outbox Pattern

Each shard database contains a `shard_sync_outbox` table. When a `Repository` writes a synced resource type to a non-global shard, it inserts a row into this outbox within the same transaction:

```
shard_sync_outbox
├── id (BIGINT, auto-increment)
├── resourceType (TEXT)
├── resourceId (UUID)
└── resourceVersionId (UUID)
```

### Shard Sync Configuration

Fine-tune the sync worker via the `shardSync` config key:

| Key                     | Type     | Default | Description                                                   |
| ----------------------- | -------- | ------- | ------------------------------------------------------------- |
| `batchSize`             | `number` | `100`   | Number of outbox rows processed per batch.                    |
| `maxIterations`         | `number` | `1000`  | Maximum batches per job invocation (prevents infinite loops). |
| `delayBetweenBatchesMs` | `number` | `10`    | Pause between batches to limit throughput.                    |
| `globalErrorThreshold`  | `number` | `3`     | Consecutive errors before aborting the job.                   |
| `maxAttempts`           | `number` | `10`    | Failed attempts before moving a row to the deadletter table.  |

### Worker Processing

A BullMQ worker (`ShardSyncWorker`) processes outbox entries in batches:

1. **Claim rows**: `SELECT ... FOR UPDATE SKIP LOCKED` atomically claims a batch, preventing concurrent processing.
2. **Deduplicate**: Multiple outbox entries for the same resource are collapsed to one sync operation (only the latest version matters).
3. **Replicate**: The worker reads the resource from the shard and writes it to the global shard via `syncResourceFromShard()`.
4. **Cleanup**: Successfully synced rows are deleted from the outbox.

### Error Handling

Failed sync attempts are tracked in the `shard_sync_outbox_attempts` table. If a row exceeds the configured `maxAttempts` (default: 10), it is moved to the `shard_sync_outbox_deadletter` table for manual investigation. The worker also tracks consecutive global errors and aborts the batch if a threshold is reached, deferring to BullMQ's retry logic.

### Bootstrap Sync

When a new project is created on a non-global shard, its `Project` resource is immediately synced to the global shard within the creation transaction (via `syncResourceFromShard()`). This avoids a window where the project exists on its shard but cannot be resolved during authentication because the async sync worker hasn't run yet.

## Configuration

### Enabling Sharding

Sharding is controlled by the `enableSharding` flag in the server configuration. When `false` (the default), all operations route to the global shard.

```json
{
  "enableSharding": true,
  "defaultShardId": "shard-1",
  "database": {
    "host": "global-db.example.com",
    "port": 5432,
    "dbname": "medplum",
    "username": "medplum",
    "password": "..."
  },
  "redis": {
    "host": "global-redis.example.com",
    "port": 6379
  },
  "shards": {
    "shard-1": {
      "database": {
        "host": "shard1-db.example.com",
        "port": 5432,
        "dbname": "medplum_shard_1",
        "username": "medplum",
        "password": "..."
      },
      "redis": {
        "host": "shard1-redis.example.com",
        "port": 6379
      }
    }
  }
}
```

### Configuration Reference

| Key              | Type                                 | Description                                                                     |
| ---------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `enableSharding` | `boolean`                            | Feature flag to enable shard-aware routing. Default: `false`.                   |
| `defaultShardId` | `string`                             | Shard ID assigned to newly created projects. Falls back to `global` if not set. |
| `shards`         | `Record<string, MedplumShardConfig>` | Map of shard ID to shard-specific database and Redis configuration.             |

Each `MedplumShardConfig` supports:

| Key                   | Type                    | Description                                                   |
| --------------------- | ----------------------- | ------------------------------------------------------------- |
| `database`            | `MedplumDatabaseConfig` | Primary PostgreSQL connection (required).                     |
| `readonlyDatabase`    | `MedplumDatabaseConfig` | Read-replica connection (optional).                           |
| `redis`               | `MedplumRedisConfig`    | Default Redis connection (required).                          |
| `cacheRedis`          | `MedplumRedisConfig`    | Dedicated cache Redis (optional, falls back to `redis`).      |
| `rateLimitRedis`      | `MedplumRedisConfig`    | Dedicated rate-limit Redis (optional, falls back to `redis`). |
| `pubSubRedis`         | `MedplumRedisConfig`    | Dedicated pub/sub Redis (optional, falls back to `redis`).    |
| `backgroundJobsRedis` | `MedplumRedisConfig`    | Dedicated BullMQ Redis (optional, falls back to `redis`).     |

The top-level `database` and `redis` keys configure the global shard. The `shards` map configures additional shards. The ID `global` is reserved and must not be used as a shard name in the `shards` map.

## Project Assignment

### New Projects

When a new project is created, it is assigned to the shard specified by `defaultShardId` (or `global` if not set). The shard ID is written to the `Project.shard` field. Operators can control placement by setting `defaultShardId` before project creation.

### Existing Projects

Projects that existed before sharding was enabled have no `shard` field. When sharding is enabled, these projects continue to resolve to the global shard. Migrating existing projects to a different shard is a manual, offline operation.

## Operational Considerations

### Cross-Shard Queries

Cross-shard queries are not supported. A single FHIR search request operates against exactly one shard. Multi-type searches validate that all requested resource types reside on the same shard and return an error if they do not.

### Super Admin Operations

Super admin endpoints (rebuild value sets, rebuild search parameters, reindex, run migrations) require an explicit `shardId` parameter. These operations must be invoked per-shard.

### Background Workers

All background job payloads (`SubscriptionJobData`, `CronJobData`, `DispatchJobData`, etc.) include a `shardId` field. Workers use this to construct a `Repository` connected to the correct shard. The BullMQ queues themselves can be backed by a global Redis instance; the shard routing happens at the application layer when the job executes.

### WebSocket Subscriptions

WebSocket subscription handlers maintain a per-shard Redis subscriber. When a WebSocket connection binds with an access token, the handler resolves the shard from the token's auth state and sets up a Redis PubSub listener for that shard. Subscription events are published to shard-specific channels, ensuring notifications route to the correct listeners.

### Database Seeding

The seed process runs against all configured shards. The global shard is seeded first, then each additional shard receives the same base resources (FHIR R4 structure definitions, search parameters, value sets). Each shard's R4 project resource is tagged with `setProjectShard()` so it correctly references its own shard.

### External Auth Providers

`config.externalAuthProviders` is not supported when sharding is enabled for projects not on the global shard. The external-auth flow receives only a JWT (with `fhirUser` or `sub` claims) and has no project context, so it cannot determine which shard to query for the profile or project membership. External auth currently works only when the target project lives on the global shard.

The planned fix is to add a project or shard ID to the `MedplumExternalAuthConfig` entry so the server can route lookups to the correct shard up front.

### Local Development

A `docker-compose.sharding.yml` file and `postgres/init_dev.sql` script provision a local multi-shard environment with a single PostgreSQL instance hosting multiple databases (`medplum`, `medplum_shard_1`, `medplum_shard_2`) and a shared Redis instance.

```bash
docker compose -f docker-compose.sharding.yml up -d
npm run dev --workspace=packages/server -- --config medplum-sharded.config.json
```

## Design Decisions

### Why Per-Project Sharding?

Per-project sharding (as opposed to per-resource-type or hash-based) was chosen because:

- **Project is the natural isolation boundary** in Medplum. Access policies, memberships, and subscriptions are all scoped to a project.
- **No cross-project joins** are needed in normal operation, so placing an entire project on one shard avoids cross-shard coordination for the vast majority of queries.
- **Operational simplicity**: moving or rebalancing is a per-project operation rather than a per-resource-type migration.

### Why Replicate Synced Resources to Global?

Authentication and unauthenticated endpoints must resolve a resource's project before the target shard is known. Since fanning out these searches to every shard is impractical at scale, a small set of resource types are replicated to the global shard asynchronously and occasionally synchronously. This keeps auth latency constant regardless of shard count.

The trade-off is **eventual consistency**: there is a brief window after a synced resource is written to its Project's shard but before the sync worker replicates it to the global shard. For some critical, infrequent flows like new project creation, the sync occurs synchronously to ensure consistency.

### Why not intelligently write Synced Resources to global and avoid the need for syncing?

Routing writes for a Project's resource types to different databases means reads must also be similarly routed. In the simple case, correctly routing isn't particularly difficult; searches for resources types A, B, C go to this shard while searches for D, E, and F go to that shard. To achieve this,
a `Repository` needs to be able to connect to both the Project's shard database and the global shard database based on the resource type being queried.

It gets complicated in access patterns that span resource types:

- **Chained search** across shard boundaries does not work since chained searches produce a single SQL query against a single database. Attempting to do so would either return incomplete results or more likely would need to throw errors; potentially breaking existing workflows.
- **Transaction bundles** including operations across shard boundaries would either be disallowed or become more complex by involving two-phase commits (2PC) to maintain transactional guarantees. This would break existing workflows and further complicate the rules of using Medplum.
- **Transactional FHIR operations** face similar challenges of needing to coordinate transactions across databases or lose certain transactional guarantees.

Co-locating all of a project's resources on the same shard avoids these classes of issues and does not further complicate nor add restrictions on the types of FHIR interactions users can perform.

### Why an Outbox Table Instead of Change Data Capture?

The outbox pattern was chosen over CDC (e.g., PostgreSQL logical replication) because:

- **No external dependencies**: the outbox is a regular table, processed by the existing BullMQ worker infrastructure.
- **Transactional guarantees**: outbox writes are part of the same transaction as the resource write, ensuring at-least-once delivery.
- **Selective replication**: only synced resource types generate outbox entries, minimizing cross-shard traffic.
- **Operational simplicity**: failed syncs are visible in the attempts and dead-letter tables, and can be retried or investigated without configuring replication slots.
- **Application layer control**: syncing is nuanced and its requirements are likely to shift over time. Keeping the logic in the application-layer facilitates faster iteration

### Why Independent Schema Per Shard?

Each shard runs the full Medplum schema (identical migrations). This means:

- **Independent upgrades**: shards can be migrated independently, enabling rolling upgrades.
- **Simpler tooling**: standard PostgreSQL tools work against any shard without special handling.
- **Per-shard search parameter customization**: because each shard has its own database, operators can define custom search parameters on specific shards, or disable unused search parameters to reduce index overhead and improve write throughput. A shard serving a population-health project might add search parameters tailored to a specific FHIR implementation guide, while a shard hosting a high-write clinical workflow might disable rarely-used parameters to minimize indexing cost. This flexibility is not practical in a single-database deployment where all projects share the same database table and index set.
