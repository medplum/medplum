---
sidebar_position: 202
---

# Monitoring Your Self-Hosted Medplum Instance

When running a self-hosted Medplum instance, proper monitoring is essential for maintaining system health and performance. This guide covers the key metrics Medplum recommends self-hosting users to track and what information they surface about your deployment. 

## Overview

Monitoring metrics are organized by layer in your stack, from highest-level user impact down to infrastructure details. The higher-level metrics are generally more useful for spotting issues, while lower-level metrics provide supporting information for diagnosis.

**Metric Sources:**
- **Medplum server metrics**: Available across all deployment environments
- **Load balancer metrics**: Generally availability from cloud load balancers, e.g. AWS ALB
- **Database metrics**: Standard PostgreSQL metrics available from any Postgres installation
- **Cache metrics**: Standard Redis metrics available from any Redis installation
- **Container metrics**: Available from any container orchestration platform

## Server-Level Metrics

These metrics come directly from the Medplum server and provide the most comprehensive view of application behavior. Specifically, these are OpenTelemetry metrics, and the exact names of those metrics are included below; see [our OTel doc](./opentelemetry.md) for a configuration guide and more details. 

### Connection Health
**Round-Trip Time (RTT)** tracks network latency between the server and PostgreSQL (`medplum.db.healthcheckRTT`), as well as the server and Redis (`medplum.redis.healthcheckRTT`). Spikes indicate connectivity issues or performance bottlenecks that can slow down the entire application.

**Queries Awaiting Client** (`medplum.db.queriesAwaitingClient`) measures database queries waiting for an available connection from the server's connection pool. High or sustained values suggest the database is overwhelmed or the connection pool is exhausted.

**Used Heap Size** (`medplum.node.usedHeapSize`) shows Node.js memory consumption. Monitor for steady increases that might indicate memory leaks.

### FHIR Operations
**FHIR Interaction Counts** break down API activity by operation type (reads `medplum.fhir.interaction.read.count`, searches `medplum.fhir.interaction.search.count`, create `medplum.fhir.interaction.create.count`, update `medplum.fhir.interaction.update.count`, delete `medplum.fhir.interaction.delete.count`). This helps you understand usage patterns and identify which operations are consuming the most resources.

**FHIR Error Rates** track failed operations by type. Some fluctuation is normal, especially for writes at low volume, but sustained increases warrant investigation. Names of metrics are the same as those for FHIR Interaction Counts, with a proper filter for where `result="failure"`. 

### Subscription Processing
**Pending Subscriptions** shows subscriptions waiting to be processed. High queue depths correlate with database performance issues since subscriptions generate audit events that require database writes. Waiting count (`medplum.subscription.waitingCount`) and delayed count (`medplum.subscription.delayedCount`) are both recorded. 

## Load Balancer Metrics

These metrics measure traffic closer to the end user and provide a more accurate view of external performance.

### Traffic and Performance
**Request Count** tracks total incoming requests. Compare with server-level metrics to identify discrepancies that might indicate routing issues.

**Response Time** measured at the load balancer level reflects actual user experience better than server-side measurements. We recommend tracking both median (P50) and 99th percentile (P99) response times, instead of just the average, to better identify performance issues.

### Error Tracking
**HTTP Error Responses** (4xx, 5xx) measured at the load balancer are the definitive source for user-facing errors. Pay special attention to 504 timeout errors, which occur when the server takes too long to respond and the load balancer returns an error to the user — even if the operation eventually succeeds on the server.

**Alert Recommendation**: Set up alerts for 504 errors with a threshold around 3 per minute.

## Database Metrics

PostgreSQL metrics provide detailed insight into data layer performance.

### Resource Usage
**CPU Utilization** is critical, especially for the writer instance. Since there's only one writer (single point of failure), keep writer CPU below 60-70%. Reader instances can run hotter since you can scale horizontally by adding more readers.

**Connection Count** tracks active database connections. PostgreSQL creates roughly one process per connection, so monitor to avoid resource exhaustion.

### Query Efficiency
**Tuples Read/Written** measure database activity at the row level. A "tuple" is essentially a single row in a database table, but they are also used to build database indexes.

**Tuples Scanned vs. Fetched** reveals query efficiency. When scanned significantly exceeds fetched, the database is reading data it ultimately discards, indicating inefficient queries or missing indexes.

**Transactions Per Second** shows overall database activity. The metric splits between commits (successful) and rollbacks (failed). Spikes in rollbacks usually indicate problems.

## Cache Metrics (Redis)

Redis serves as a fast in-memory cache to reduce database load and store ephemeral data.

### Performance
**CPU and Memory Usage** track Redis resource consumption. Memory usage directly correlates with stored data since Redis is an in-memory store.

**Cache Hit/Miss Ratio** shows cache effectiveness. Some misses are normal, but unusual spikes might indicate application issues or invalid reference patterns.

### Capacity Management
**Evictions** occur when Redis runs out of memory and must remove least-recently-used items. Ideally this should be zero, but occasional evictions aren't necessarily problematic if all the data being operated on at one time still fits in cache.

**Alert Recommendation**: Monitor for evictions > 0 as an early warning of capacity issues.

## Container Metrics

These metrics track resource usage at the system level, whether running on bare metal servers, virtual machines, or containerized deployments (Docker, Kubernetes, ECS, etc.).

### CPU Considerations for Node.js
**CPU Utilization** requires special interpretation for Node.js applications. Since Node.js is single-threaded for application code, one fully-utilized core represents 100% application capacity.

Calculate your threshold as: `1 / (number of CPU cores) * 100`

For example:
- 4-core system: Alert at 25% CPU
- 8-core system: Alert at 12.5% CPU  
- 32-core system: Alert at 3% CPU

When CPU exceeds this threshold, the Node.js main thread is fully occupied and additional requests will queue up, causing exponential performance degradation.

**Memory Usage** tracks container memory consumption, useful for detecting leaks or capacity planning.

**Network I/O** provides supporting information about data transfer volumes, helpful for understanding traffic patterns and response sizes.

## Alerting Strategy

### High-Priority Alerts
Set up immediate alerts for metrics that directly impact users:
- 500 error rates, especially load balancer error rates (504s)
- Database writer CPU > 50-60%, sustained for more than a few minutes
- Response time increases (P50 and P99 at different thresholds)

### Supporting Alerts
Configure alerts with higher thresholds for infrastructure metrics:
- Container CPU usage (based on core count calculation above)
- Redis evictions > 0
- Database connection exhaustion

### Alert Tuning
Start with conservative (low) thresholds and adjust upward to reduce false positives. It's better to begin with frequent alerts and tune them down than to miss real issues with thresholds set too high.

## Monitoring Best Practices

1. **Focus on user impact first**: Load balancer metrics typically provide the best indication of user experience
2. **Use server metrics for rich diagnostics**: Medplum server metrics offer the most detailed view of application behavior  
3. **Treat infrastructure metrics as supporting information**: Database and container metrics help diagnose root causes but are often too noisy for primary alerting
4. **Consider your deployment differences**: Metric availability and thresholds may vary based on your cloud provider and container orchestration platform
5. **Establish baselines**: Understand normal patterns for your workload before setting alert thresholds

Remember that self-hosted environments will have different baseline performance characteristics than managed cloud deployments. Take time to understand your system's normal behavior patterns before finalizing alert configurations.