// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ILogger } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { DurableQueue } from './durable-queue';
import { RETENTION_PHASE1_DELETE, RETENTION_PHASE2_DELETE, RETENTION_PHASE3_DELETE } from './queries';

/** Default retention window for `processed` rows. */
export const DEFAULT_RETENTION_DAYS = 7;
/** Default soft cap on the database file size. */
export const DEFAULT_MAX_SIZE_MB = 512;
/** Default floor for `errored` / `nacked` retention (never purged before this). */
export const DEFAULT_ERRORED_RETENTION_DAYS = 90;
/** Default sweep interval. */
export const DEFAULT_SWEEP_INTERVAL_SECS = 3600;

export interface RetentionSweeperOptions {
  queue: DurableQueue;
  log: ILogger;
  /** Time-based retention for `processed` rows, in days. Default 7. */
  retentionDays?: number;
  /** Soft cap on DB size, in MiB. Default 512. */
  maxSizeMb?: number;
  /** Floor for `errored` / `nacked` retention, in days. Default 90. */
  erroredRetentionDays?: number;
  /** How often the sweeper runs, in seconds. Default 3600 (1h). */
  sweepIntervalSecs?: number;
}

export interface SweepResult {
  deletedProcessed: number;
  deletedErrored: number;
  dbSizeBytesAfter: number;
}

/**
 * Background sweeper that enforces the queue's retention policy.
 *
 * Phases (§11 of the plan):
 *  1. Delete fully-done `processed` rows (ACK delivered/not-owed) past the time window.
 *  2. If still over the size cap, delete oldest fully-done `processed` rows until under.
 *  3. If still over cap *and* the oldest floor-protected row is past the errored
 *     floor, delete oldest `rejected` / `failed` / `nacked` rows — and `processed`
 *     rows whose ACK is still `undelivered` — past the floor.
 *  4. Checkpoint the WAL to reclaim disk space.
 *
 * Running periodically (not just on size pressure) keeps the DB tidy on agents
 * with low message volume, where size-driven sweeps would never fire.
 *
 * Fast WAL checkpointing between sweeps is NOT this class's job — the App runs
 * {@link DurableQueue.checkpointWalIfDirty} on every agent heartbeat tick.
 */
export class RetentionSweeper {
  private readonly queue: DurableQueue;
  private readonly log: ILogger;
  private readonly retentionMs: number;
  private readonly maxSizeBytes: number;
  private readonly erroredRetentionMs: number;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private lastSweepAt: number | null = null;
  private lastResult: SweepResult | null = null;

  constructor(options: RetentionSweeperOptions) {
    this.queue = options.queue;
    this.log = options.log;
    this.retentionMs = (options.retentionDays ?? DEFAULT_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
    this.maxSizeBytes = (options.maxSizeMb ?? DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
    this.erroredRetentionMs = (options.erroredRetentionDays ?? DEFAULT_ERRORED_RETENTION_DAYS) * 24 * 60 * 60 * 1000;
    this.intervalMs = (options.sweepIntervalSecs ?? DEFAULT_SWEEP_INTERVAL_SECS) * 1000;
  }

  /** Starts the periodic sweep timer and runs one sweep right away. No-op if already started. */
  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.runSweep(), this.intervalMs);
    // Don't keep the event loop alive on this timer alone.
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
    // Sweep immediately: the interval alone would delay the first sweep a full
    // interval (default 1h) after every process start, so an agent restarted
    // more often than that would never enforce retention. The sweep schedule is
    // in-memory only — there's no persisted "last swept at" to resume from.
    this.runSweep();
  }

  /** Fire-and-forget wrapper around {@link RetentionSweeper.sweep} that logs failures. */
  private runSweep(): void {
    this.sweep().catch((err) => {
      this.log.error(`Retention sweep crashed: ${normalizeErrorString(err)}`);
    });
  }

  /** Stops the periodic sweep timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Run a single sweep cycle immediately. Safe to call from `start`'s timer or tests.
   * @param now - Override the "now" timestamp used for retention comparisons.
   * @returns The deletion counts and DB size after this sweep cycle.
   */
  async sweep(now: number = Date.now()): Promise<SweepResult> {
    if (this.running) {
      // A previous sweep is still running (e.g. on a very slow disk). Skip rather
      // than queue — the next interval will pick up where this one left off.
      return (
        this.lastResult ?? { deletedProcessed: 0, deletedErrored: 0, dbSizeBytesAfter: this.queue.getDbSizeBytes() }
      );
    }
    this.running = true;
    try {
      const db = this.queue.getDb();
      const cutoffProcessed = now - this.retentionMs;
      const cutoffErrored = now - this.erroredRetentionMs;

      // Phase 1: time-based purge of fully-done processed rows. A processed row
      // whose ACK never reached the source (ack_outcome = 'undelivered') is NOT
      // fully done — it must survive long enough for the source to retransmit
      // (which replays the stored ACK) and is an operator signal — so it's
      // excluded here and protected by the errored floor in phase 3.
      const phase1 = db.prepare(RETENTION_PHASE1_DELETE).run(cutoffProcessed);

      let deletedProcessed = Number(phase1.changes);
      let deletedErrored = 0;

      // Phase 2: size-driven purge of fully-done processed rows in oldest-first batches.
      const sizeBudget = this.maxSizeBytes;
      const batchSize = 1000;
      const purgeOldestProcessed = db.prepare(RETENTION_PHASE2_DELETE);
      while (this.queue.getDbSizeBytes() > sizeBudget) {
        const info = purgeOldestProcessed.run(batchSize);
        if (info.changes === 0) {
          // No more fully-done processed rows to delete — fall through to phase 3.
          break;
        }
        deletedProcessed += Number(info.changes);
      }

      // Phase 3: if still over budget, peel off the floor-protected terminal rows
      // past the errored floor — rejected/failed/nacked, plus processed rows
      // whose ACK is still undelivered. We never delete these younger than the
      // floor regardless of size pressure — better to alert on disk than to
      // silently drop forensics evidence (or a row a source might still
      // retransmit against). Ordered by the terminal timestamp, which is
      // errored_at for failures and processed_at for undelivered rows.
      if (this.queue.getDbSizeBytes() > sizeBudget) {
        const purgeOldestErrored = db.prepare(RETENTION_PHASE3_DELETE);
        while (this.queue.getDbSizeBytes() > sizeBudget) {
          const info = purgeOldestErrored.run(cutoffErrored, batchSize);
          if (info.changes === 0) {
            break;
          }
          deletedErrored += Number(info.changes);
        }
      }

      // Phase 4: actually reclaim space. Without this, the WAL can hold deleted
      // pages indefinitely on a low-traffic agent. Best-effort; logs internally.
      this.queue.checkpointWal();

      const result: SweepResult = {
        deletedProcessed,
        deletedErrored,
        dbSizeBytesAfter: this.queue.getDbSizeBytes(),
      };
      this.lastResult = result;
      this.lastSweepAt = now;

      if (deletedProcessed > 0 || deletedErrored > 0) {
        this.log.info(
          `Retention sweep: deleted ${deletedProcessed} processed, ${deletedErrored} errored. DB ${result.dbSizeBytesAfter} bytes.`
        );
      }
      return result;
    } finally {
      this.running = false;
    }
  }

  /** @returns Time of the most recent sweep, or null if none has run yet. */
  getLastSweepAt(): number | null {
    return this.lastSweepAt;
  }

  /** @returns Result of the most recent sweep, or null if none has run yet. */
  getLastResult(): SweepResult | null {
    return this.lastResult;
  }
}
