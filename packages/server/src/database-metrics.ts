// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import os from 'node:os';
import type { Pool, PoolClient } from 'pg';
import type { RecordMetricOptions } from './otel/metrics';
import { incrementCounter, recordHistogramValue } from './otel/metrics';

export type DatabaseInstanceType = 'reader' | 'writer';
// Keep transaction outcomes to a fixed set so the metric remains low-cardinality.
export type DatabaseTransactionOutcome = 'committed' | 'rolled_back' | 'retryable_rollback' | 'rollback_failed';

const hostname = os.hostname();

/**
 * Adds the dimensions shared by all database metrics. `hostname` supports per-process
 * inspection and fleetwide aggregation, while `dbInstanceType` keeps reader and writer
 * pool behavior distinguishable.
 * @param dbInstanceType - The physical database pool being measured.
 * @param options - Optional OpenTelemetry instrument configuration, such as a unit.
 * @returns Metric options containing the shared database dimensions.
 */
export function getDatabaseMetricOptions(
  dbInstanceType: DatabaseInstanceType,
  options?: RecordMetricOptions['options']
): RecordMetricOptions {
  return {
    attributes: { hostname, dbInstanceType },
    options,
  };
}

/**
 * Attaches metrics to pg-pool's physical connection lifecycle. These listeners only
 * observe pool events; they do not change checkout, release, or eviction behavior.
 * @param pool - The pg-pool instance to instrument.
 * @param dbInstanceType - Whether the pool connects to the reader or writer database.
 */
export function instrumentDatabasePool(pool: Pool, dbInstanceType: DatabaseInstanceType): void {
  const metricOptions = getDatabaseMetricOptions(dbInstanceType);
  // Durations are exported in seconds to match the other database latency metrics.
  const durationMetricOptions = getDatabaseMetricOptions(dbInstanceType, { unit: 's' });

  // PoolClient identity is the only stable key shared by all pg-pool lifecycle events.
  // WeakMaps also ensure that metric bookkeeping cannot keep a client alive if pg-pool
  // drops it without emitting the expected final event during an unusual shutdown path.
  const connectedAt = new WeakMap<PoolClient, number>();
  // This stores only the most recent successful release. It is separate from connectedAt
  // because one physical connection can be acquired and released many times.
  const releasedAt = new WeakMap<PoolClient, number>();

  pool.on('connect', (client) => {
    // `connect` means pg-pool created a new physical PostgreSQL connection, not merely
    // that an existing pooled connection was checked out.
    connectedAt.set(client, Date.now());
    incrementCounter('medplum.db.connectionsCreated', metricOptions);
  });

  pool.on('acquire', (client) => {
    // The client is no longer idle. Clearing the prior release timestamp prevents a
    // later removal of an active client from being classified as idle eviction.
    releasedAt.delete(client);
    // Comparing acquires with connects shows how often physical connections are reused.
    incrementCounter('medplum.db.connectionsAcquired', metricOptions);
  });

  pool.on('release', (err, client) => {
    if (err) {
      // A truthy release error tells pg-pool to destroy the client. This includes
      // `release(true)` as well as releases caused by query or transaction failures.
      releasedAt.delete(client);
      incrementCounter('medplum.db.connectionsReleasedDestroy', metricOptions);
    } else {
      // A successful release returns the client to the idle pool. Overwrite any prior
      // timestamp so idleBeforeRemoval measures the final idle interval only.
      releasedAt.set(client, Date.now());
    }
  });

  pool.on('error', () => {
    // pg-pool surfaces backend, socket, and other client failures separately from
    // routine idle eviction, allowing normal churn to be distinguished from failures.
    incrementCounter('medplum.db.connectionErrors', metricOptions);
  });

  pool.on('remove', (client) => {
    // `remove` is the terminal event for a physical client, regardless of whether the
    // cause was idle timeout, an error, a destructive release, or pool shutdown.
    const now = Date.now();
    incrementCounter('medplum.db.connectionsRemoved', metricOptions);

    const connectionStart = connectedAt.get(client);
    if (connectionStart !== undefined) {
      // Lifetime spans physical creation through removal and includes every reuse cycle.
      recordHistogramValue('medplum.db.connectionLifetime', (now - connectionStart) / 1000, durationMetricOptions);
      connectedAt.delete(client);
    }

    const lastRelease = releasedAt.get(client);
    if (lastRelease !== undefined) {
      // This value should cluster near pg-pool's idle timeout when normal idle eviction
      // is responsible for most connection churn.
      recordHistogramValue('medplum.db.idleBeforeRemoval', (now - lastRelease) / 1000, durationMetricOptions);
      releasedAt.delete(client);
    }
  });
}

/**
 * Records one terminal outcome for each outer writer transaction attempt.
 * @param outcome - The fixed, low-cardinality terminal outcome.
 * @returns Whether OpenTelemetry metrics are enabled and the counter was recorded.
 */
export function recordDatabaseTransaction(outcome: DatabaseTransactionOutcome): boolean {
  const metricOptions = getDatabaseMetricOptions('writer');
  // Outcome is deliberately the only transaction-specific dimension; exception text,
  // SQL, and other unbounded values must not become metric attributes.
  metricOptions.attributes = { ...metricOptions.attributes, outcome };
  return incrementCounter('medplum.db.transactions', metricOptions);
}
