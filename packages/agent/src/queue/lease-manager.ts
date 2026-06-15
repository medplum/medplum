// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ILogger } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import { randomUUID } from 'node:crypto';
import type { DurableQueue } from './durable-queue';

/**
 * Default lease lifetime. Picked to be:
 * - Long enough that ordinary GC pauses or slow disks don't cost us the lease
 *   under load.
 * - Short enough that, when an agent dies un-gracefully, a peer can take over
 *   within tens of seconds rather than minutes.
 */
export const DEFAULT_LEASE_TTL_MS = 30_000;

/**
 * How often the leaseholder re-extends its lease. Must be comfortably less than
 * {@link DEFAULT_LEASE_TTL_MS} so transient delays don't let the lease expire.
 */
export const DEFAULT_LEASE_HEARTBEAT_MS = 10_000;

/**
 * How often a non-leader retries acquisition. Shorter is fine — the underlying
 * SQL is a single conditional UPSERT and is cheap.
 */
export const DEFAULT_LEASE_ACQUIRE_RETRY_MS = 2_000;

export interface QueueLeaseManagerOptions {
  queue: DurableQueue;
  log: ILogger;
  /** Override the per-process holder ID. Defaults to a fresh UUID. */
  holder?: string;
  /** Override the lease TTL in ms. */
  ttlMs?: number;
  /** Override the heartbeat interval in ms. */
  heartbeatMs?: number;
  /** Override the acquire retry interval in ms. */
  acquireRetryMs?: number;
}

/**
 * Lightweight leader election over the durable queue.
 *
 * One agent process per durable-queue file may run the queue worker and the
 * `recoverOnStartup` sweep at a time. This is the load-bearing primitive that
 * makes zero-downtime upgrades safe: during the overlap window where the old
 * and new agent processes both have the SQLite file open, only the leaseholder
 * acts on the data; the non-leader waits.
 *
 * Protocol:
 *  - `start(onBecameLeader)` tries to acquire the lease immediately. If it
 *    succeeds, fires `onBecameLeader` synchronously and begins heartbeating
 *    every `heartbeatMs`.
 *  - If acquisition fails, schedules a retry every `acquireRetryMs` until it
 *    succeeds. Each successful acquisition (including the first) fires the
 *    callback exactly once per "run" of leadership.
 *  - A failed heartbeat means a peer stole the lease (we slept too long). We
 *    log, fire `onLostLeadership` so the caller can drain its workers, and
 *    switch back to follower mode; if we recover, a future acquire will fire
 *    `onBecameLeader` again.
 *  - `stop()` releases the lease (only if we still hold it) and clears timers.
 *
 * The class is deliberately stateless about what the leader *does* — the App
 * threads the `recoverOnStartup` call and worker bring-up through the callback.
 */
export class QueueLeaseManager {
  private readonly queue: DurableQueue;
  private readonly log: ILogger;
  private readonly holderId: string;
  private readonly ttlMs: number;
  private readonly heartbeatMs: number;
  private readonly acquireRetryMs: number;

  private leader = false;
  private acquireTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private onBecameLeader: (() => void) | undefined;
  private onLostLeadership: (() => void) | undefined;
  private stopped = false;

  constructor(options: QueueLeaseManagerOptions) {
    this.queue = options.queue;
    this.log = options.log;
    this.holderId = options.holder ?? randomUUID();
    this.ttlMs = options.ttlMs ?? DEFAULT_LEASE_TTL_MS;
    this.heartbeatMs = options.heartbeatMs ?? DEFAULT_LEASE_HEARTBEAT_MS;
    this.acquireRetryMs = options.acquireRetryMs ?? DEFAULT_LEASE_ACQUIRE_RETRY_MS;
  }

  /**
   * Begins the acquire-and-heartbeat loop. `onBecameLeader` fires every time
   * we transition from follower to leader (typically once, but can repeat if
   * we lose the lease mid-run and reclaim it). `onLostLeadership` fires when a
   * heartbeat discovers a peer stole the lease, so the caller can drain workers
   * before the peer starts acting on the shared data.
   * @param onBecameLeader - Callback invoked when this process takes the lease.
   * @param onLostLeadership - Callback invoked when a heartbeat finds the lease lost.
   */
  start(onBecameLeader: () => void, onLostLeadership?: () => void): void {
    this.onBecameLeader = onBecameLeader;
    this.onLostLeadership = onLostLeadership;
    this.stopped = false;
    this.tryAcquire();
  }

  /**
   * Stops the manager and releases the lease if we hold it. Idempotent.
   * @returns True if we were the leader when stopping (and released the lease).
   */
  stop(): boolean {
    this.stopped = true;
    this.clearAcquireTimer();
    this.clearHeartbeatTimer();
    const wasLeader = this.leader;
    if (this.leader) {
      try {
        this.queue.releaseLease(this.holderId);
      } catch (err) {
        this.log.warn(`Failed to release queue lease: ${normalizeErrorString(err)}`);
      }
      this.leader = false;
    }
    return wasLeader;
  }

  /** @returns True if this process currently holds the lease. */
  isLeader(): boolean {
    return this.leader;
  }

  /** @returns The holder ID this manager identifies as (for diagnostics). */
  getHolderId(): string {
    return this.holderId;
  }

  private tryAcquire(): void {
    if (this.stopped) {
      return;
    }
    let acquired = false;
    try {
      acquired = this.queue.tryAcquireLease(this.holderId, this.ttlMs);
    } catch (err) {
      this.log.warn(`Queue lease acquire threw: ${normalizeErrorString(err)}`);
    }

    if (acquired) {
      this.leader = true;
      this.clearAcquireTimer();
      this.log.info(`Acquired queue lease (holder=${this.holderId}).`);
      this.scheduleHeartbeat();
      // Fire callback last so any exception from it doesn't leave timers stopped.
      try {
        this.onBecameLeader?.();
      } catch (err) {
        this.log.error(`onBecameLeader callback threw: ${normalizeErrorString(err)}`);
      }
      return;
    }

    // Someone else holds the lease — try again in a bit.
    this.scheduleAcquireRetry();
  }

  private scheduleAcquireRetry(): void {
    if (this.stopped || this.acquireTimer) {
      return;
    }
    this.acquireTimer = setTimeout(() => {
      this.acquireTimer = undefined;
      this.tryAcquire();
    }, this.acquireRetryMs);
    if (typeof this.acquireTimer.unref === 'function') {
      this.acquireTimer.unref();
    }
  }

  private scheduleHeartbeat(): void {
    if (this.stopped || this.heartbeatTimer) {
      return;
    }
    this.heartbeatTimer = setInterval(() => this.heartbeat(), this.heartbeatMs);
    if (typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }
  }

  private heartbeat(): void {
    if (this.stopped || !this.leader) {
      return;
    }
    let extended = false;
    try {
      extended = this.queue.heartbeatLease(this.holderId, this.ttlMs);
    } catch (err) {
      this.log.warn(`Queue lease heartbeat threw: ${normalizeErrorString(err)}`);
      return;
    }
    if (!extended) {
      // We lost the lease — a peer took over after our TTL elapsed. Drop back
      // to follower mode and notify the caller so it can drain its workers
      // before the peer starts acting on the shared queue. (A small overlap
      // window is inherent to TTL leases: the peer could only acquire after our
      // TTL expired, so detection latency is bounded by the heartbeat interval.)
      this.log.error(`Lost queue lease (holder=${this.holderId}); peer took over. Draining workers.`);
      this.leader = false;
      this.clearHeartbeatTimer();
      // Fire callback before re-scheduling acquire so a drain exception can't
      // skip the retry loop.
      try {
        this.onLostLeadership?.();
      } catch (err) {
        this.log.error(`onLostLeadership callback threw: ${normalizeErrorString(err)}`);
      }
      this.scheduleAcquireRetry();
    }
  }

  private clearAcquireTimer(): void {
    if (this.acquireTimer) {
      clearTimeout(this.acquireTimer);
      this.acquireTimer = undefined;
    }
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }
}
