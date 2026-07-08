// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PoolClient } from 'pg';
import { getLogger } from '../../logger';
import { recordHistogramValue } from '../../otel/otel';

export type TransactionIdleStatus = 'committed' | 'rolled_back';

export type TransactionIdleTrackerOptions = {
  thresholdMs: number;
  attempt: number;
  transactionAttempts: number;
  serializable: boolean;
};

export class TransactionIdleTracker {
  static readonly OTEL_MAX_METRIC_NAME = 'medplum.db.idleInTransactionMaxMs';
  static readonly OTEL_TOTAL_METRIC_NAME = 'medplum.db.idleInTransactionTotalMs';
  static readonly LOG_HIGH_IDLE_TIME_MSG = 'High idle in transaction time';
  private readonly client: PoolClient;
  private readonly options: TransactionIdleTrackerOptions;
  private readonly startTimeMs: number;
  private readonly originalQuery: PoolClient['query'];
  private readonly originalQueryFn: (...args: any[]) => any;
  private readonly wrappedQuery: PoolClient['query'];
  private lastIdleStartTimeMs: number;
  private maxIdleMs = 0;
  private totalIdleMs = 0;
  private queryDurationMs = 0;
  private activeQueryCount = 0;
  private queryCount = 0;
  private finished = false;

  constructor(client: PoolClient, options: TransactionIdleTrackerOptions) {
    this.client = client;
    this.options = options;
    this.startTimeMs = Date.now();
    // The transaction is idle as soon as BEGIN finishes and until the first query starts.
    this.lastIdleStartTimeMs = this.startTimeMs;
    this.originalQuery = client.query; // for restoring
    this.originalQueryFn = client.query.bind(client); // for calling the original query function
    this.wrappedQuery = ((...args: any[]) => this.query(args)) as PoolClient['query'];
    // Patch only the transaction's dedicated PoolClient, and restore it when tracking ends.
    client.query = this.wrappedQuery;
  }

  finish(status: TransactionIdleStatus): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.restore();

    // Keep both logs and metrics thresholded so this stays useful during spikes.
    if (this.maxIdleMs < this.options.thresholdMs) {
      return;
    }

    const transactionDurationMs = Date.now() - this.startTimeMs;
    const attributes = {
      attempt: this.options.attempt,
      serializable: this.options.serializable,
      status,
    };

    recordHistogramValue(TransactionIdleTracker.OTEL_TOTAL_METRIC_NAME, this.totalIdleMs, {
      attributes,
      options: { unit: 'ms' },
    });
    recordHistogramValue(TransactionIdleTracker.OTEL_MAX_METRIC_NAME, this.maxIdleMs, {
      attributes,
      options: { unit: 'ms' },
    });
    getLogger().warn(TransactionIdleTracker.LOG_HIGH_IDLE_TIME_MSG, {
      ...attributes,
      totalIdleMs: this.totalIdleMs,
      maxIdleMs: this.maxIdleMs,
      transactionDurationMs,
      queryDurationMs: this.queryDurationMs,
      queryCount: this.queryCount,
      transactionAttempts: this.options.transactionAttempts,
      thresholdMs: this.options.thresholdMs,
    });
  }

  discard(): void {
    if (this.finished) {
      return;
    }
    // Stop measuring when the query shape cannot be timed accurately.
    this.finished = true;
    this.restore();
  }

  private query(args: any[]): any {
    const queryStartTimeMs = Date.now();
    // The gap since the previous completed query is the approximation of "idle in transaction".
    this.startQuery(queryStartTimeMs);

    try {
      const result = this.originalQueryFn(...args);
      if (result && typeof result.finally === 'function') {
        // Promise-returning pg queries are the normal repository path and can be timed exactly.
        return result.finally(() => this.endQuery(queryStartTimeMs));
      }

      // Callback/EventEmitter query styles still run, but we cannot know when DB work
      // finishes without a broader wrapper. Disable reporting rather than emit false idle.
      this.discard();
      return result;
    } catch (err) {
      this.endQuery(queryStartTimeMs);
      throw err;
    }
  }

  private startQuery(queryStartTimeMs: number): void {
    if (this.finished) {
      return;
    }
    if (this.activeQueryCount === 0) {
      // Only the first concurrent query closes the idle period.
      const idleMs = queryStartTimeMs - this.lastIdleStartTimeMs;
      this.totalIdleMs += idleMs;
      this.maxIdleMs = Math.max(this.maxIdleMs, idleMs);
    }
    this.activeQueryCount++;
  }

  private endQuery(queryStartTimeMs: number): void {
    if (this.finished) {
      return;
    }
    const queryEndTimeMs = Date.now();
    this.queryDurationMs += queryEndTimeMs - queryStartTimeMs;
    this.queryCount++;
    this.activeQueryCount = Math.max(this.activeQueryCount - 1, 0);
    if (this.activeQueryCount === 0) {
      // When the last active query ends, the transaction becomes idle again.
      this.lastIdleStartTimeMs = queryEndTimeMs;
    }
  }

  private restore(): void {
    // Avoid clobbering a later wrapper if something else replaced query first.
    if (this.client.query === this.wrappedQuery) {
      this.client.query = this.originalQuery;
    }
  }
}
