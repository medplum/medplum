---
sidebar_position: 101
---

# GIN Index Performance

:::caution

The operations described in this guide require [super admin](/docs/self-hosting/super-admin-guide) privileges and are only available to self-hosted deployments.

:::

Medplum uses PostgreSQL [GIN (Generalized Inverted Index)](https://www.postgresql.org/docs/current/gin-intro.html) indexes on resource tables for search operations. By default, GIN indexes use a mechanism called [`fastupdate`](https://www.postgresql.org/docs/current/gin-implementation.html#GIN-FAST-UPDATE) that defers index maintenance by buffering changes in a pending list. This improves write throughput for low-concurrency workloads, but causes significant problems during bulk operations.

## When You'll Hit This

You're likely to encounter issues if you are:

- Running bulk data imports or migrations
- Performing high-concurrency upserts (e.g. parallel batch requests with conditional creates/updates)

Symptoms include:

- **Serialization errors** (`40001`): Parallel writes contend on the same pending list pages, causing predicate lock conflicts and transaction failures
- **Slow queries**: The pending list (up to 4MB) must be scanned on every read, inflating cost estimates and causing the query planner to choose sequential scans over the GIN index
- **Sporadic slow writes**: Occasional inserts trigger a full pending list flush, causing unpredictable latency spikes

## Disabling `fastupdate`

Disabling `fastupdate` causes each insert/update to immediately update the index instead of deferring to the pending list. This eliminates both the serialization errors and the bad query plans.

### Using the Medplum API

Medplum provides a super admin operation to configure GIN indexes. This requires the `Prefer: respond-async` header and runs as an async job:

```http
POST /fhir/R4/$db-configure-indexes
Content-Type: application/fhir+json
Prefer: respond-async

{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "tableName",
      "valueString": "Patient"
    },
    {
      "name": "fastUpdateAction",
      "valueString": "set"
    },
    {
      "name": "fastUpdateValue",
      "valueBoolean": false
    }
  ]
}
```

This disables `fastupdate` on all GIN indexes for the specified table and automatically runs `VACUUM` to flush the existing pending list.

:::tip

You can specify multiple `tableName` parameters to configure indexes on several tables in a single request.

:::

### Using SQL Directly

If you have direct database access, you can disable `fastupdate` on a specific index:

```sql
ALTER INDEX "Patient___idnt_idx" SET (fastupdate = off);
VACUUM "Patient";
```

The `VACUUM` is necessary to flush any entries remaining in the pending list after disabling `fastupdate`.

## Transaction Retry Settings

As a complementary measure, tuning the server's transaction retry settings helps handle any remaining serialization errors gracefully. Set the following in your [server config](/docs/self-hosting/server-config):

| Setting | Recommended Value | Description |
|---------|-------------------|-------------|
| `transactionAttempts` | `3` - `4` | Number of retry attempts for serialization failures |
| `transactionExpBackoffBaseDelayMs` | `200` | Base delay in milliseconds for exponential backoff between retries |

:::caution

Transaction retries mask the symptoms but don't address the root cause. If you're seeing a high rate of serialization errors, disabling `fastupdate` on the affected tables is the recommended fix.

:::
