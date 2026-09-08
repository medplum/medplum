// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ILogger } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { App } from '../app';
import type { DurableQueue } from './durable-queue';
import { QueueLeaseError } from './types';
import type { ChannelQueueWorker } from './worker';

/** Polling delay when the queue is empty (in addition to wake-on-notify). */
export const DEFAULT_IDLE_POLL_MS = 250;

/**
 * Longest an unbroken run of synchronous claim iterations may hold the event loop
 * before {@link ChannelDispatcher} yields a turn — see the burst budget in
 * {@link ChannelDispatcher.loop}.
 */
export const DEFAULT_LOOP_YIELD_BUDGET_MS = 5;

export interface ChannelDispatcherOptions {
  channelName: string;
  app: App;
  queue: DurableQueue;
  log: ILogger;
  /**
   * The channel's dispatch slots, read live on every iteration so a pool resize
   * reaches the loop without restarting it.
   */
  workers: () => ChannelQueueWorker[];
  /**
   * Computes a claimed row's logical-channel key (FIFO partition) from its stored
   * bytes under the channel's CURRENT spec. Injected rather than read off the
   * channel so the dispatcher stays decoupled from it and the key always reflects
   * the live spec. Must be synchronous and must not throw (a row that no longer
   * parses falls back to the default `''` partition) — it is called inside the
   * await-free critical section below.
   *
   * Defaults to `() => ''`: one fully-serialized logical channel, i.e. no partitioning.
   */
  computeKey?: (originalMessage: Buffer) => string;
  /** Override for unit tests; default {@link DEFAULT_IDLE_POLL_MS}. */
  idlePollMs?: number;
  /** Override for unit tests; default {@link DEFAULT_LOOP_YIELD_BUDGET_MS}. */
  loopYieldBudgetMs?: number;
}

/**
 * The channel's single claimer. Owns the whole claim side of the durable queue —
 * the loop, the wake signal, the idle poll, and the logical-channel partition
 * gate — and hands each claimed row to a free {@link ChannelQueueWorker}, which
 * does nothing but await the server round trip and settle the row.
 *
 * **Why one claimer.** `node:sqlite` is synchronous and the agent is one process,
 * so N workers each running `claimNext` cannot claim in parallel — they serialize
 * on the same thread, and only one can win a given row. Every other claim is pure
 * head-of-line latency on the MLLP sockets and the agent WebSocket sharing that
 * thread. Concentrating claims here makes their cost independent of pool size:
 * one claim per enqueue and one per freed slot, at any `maxWorkers`. A pool of N
 * workers used to broadcast-wake all N on every enqueue and every settle (~2N
 * claims per message) and to poll N times per idle interval; both are now 1.
 *
 * **Why it also makes ordering safer.** The partition gate must be atomic against
 * other claimers: nothing may observe a row between its claim and the moment its
 * key is recorded, or two workers can dispatch the same logical channel
 * concurrently and out of order. That used to rest on a no-`await` convention
 * spanning two methods across N racing workers. Here it is structural — there is
 * only one claimer, and the gate is a single synchronous run of statements.
 */
export class ChannelDispatcher {
  readonly channelName: string;
  private readonly app: App;
  private readonly queue: DurableQueue;
  private readonly log: ILogger;
  private readonly workers: () => ChannelQueueWorker[];
  private readonly computeKey: (originalMessage: Buffer) => string;
  private readonly idlePollMs: number;
  private readonly loopYieldBudgetMs: number;

  private running = false;
  private stopping = false;
  private loopPromise: Promise<void> | undefined;
  /**
   * Set by {@link notify}, cleared only when {@link waitForWork} acts on it. A flag
   * rather than a promise the waiter swaps out: a wake can land at any point,
   * including between the loop being released and it reaching the next wait, and
   * dropping one stalls the channel for a whole idle-poll interval.
   */
  private wakePending = false;
  /** Releases the current {@link waitForWork}, if the loop is in one. */
  private wakeWaiter: (() => void) | undefined;

  constructor(options: ChannelDispatcherOptions) {
    this.channelName = options.channelName;
    this.app = options.app;
    this.queue = options.queue;
    this.log = options.log;
    this.workers = options.workers;
    this.computeKey = options.computeKey ?? ((): string => '');
    this.idlePollMs = options.idlePollMs ?? DEFAULT_IDLE_POLL_MS;
    this.loopYieldBudgetMs = options.loopYieldBudgetMs ?? DEFAULT_LOOP_YIELD_BUDGET_MS;
  }

  /** Starts the claim loop. No-op if already started. */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.stopping = false;
    this.loopPromise = this.loop().catch((err) => {
      this.running = false;
      this.log.error(`Dispatcher loop crashed for channel '${this.channelName}': ${normalizeErrorString(err)}`);
    });
  }

  /**
   * @returns True while the claim loop is live. Goes false after {@link stop} or
   * after the dispatcher steps down on lease loss — the channel checks this to
   * restart claiming when it reacquires the lease.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Signals that work may be available: a row was enqueued, a slot freed, a
   * partition was woken, the server reconnected, or a config/lease change lifted
   * a claim gate. Idempotent; calls that arrive before the loop wakes coalesce
   * into a single wake.
   */
  notify(): void {
    this.wakePending = true;
    this.wakeWaiter?.();
  }

  /**
   * Called by a slot whose settle write was refused because a peer holds the
   * queue lease. A demoted process must stop claiming at once; the slots keep
   * their own heartbeat watchdog for anything still in flight, and the channel
   * restarts this dispatcher if it reacquires the lease.
   */
  onSlotLeaseLost(): void {
    if (!this.running || this.stopping) {
      return;
    }
    this.log.info(`Dispatcher for channel '${this.channelName}' stepping down: queue lease taken by a peer.`);
    this.stopping = true;
    this.notify();
  }

  /** Stops claiming. In-flight dispatches are the slots' own to finish or cancel. */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.stopping = true;
    // Wake the loop so it observes `stopping` without waiting on the idle poll.
    this.notify();
    if (this.loopPromise) {
      await this.loopPromise;
    }
    this.running = false;
  }

  private async loop(): Promise<void> {
    // When the current unbroken run of synchronous iterations began; undefined
    // whenever the last iteration awaited something. See the budget check below.
    let burstStartedAt: number | undefined;
    while (!this.stopping) {
      try {
        // Don't claim while the server connection is down — a dispatch started
        // now would only sit in the in-memory WS queue until the response timer
        // errored it. Rows stay durably `queued` and drain on reconnect (§9);
        // app.ts notifies us when the connection comes back.
        // Also hold off while a logicalChannelKey rewrite is in progress: claiming
        // against a half-rewritten set of stored keys is the skip-ahead that rewrite
        // exists to close (see DurableQueue.isClaimPaused). It notifies us when done.
        if (!this.app.isLive() || this.queue.isClaimPaused(this.channelName)) {
          burstStartedAt = undefined;
          await this.waitForWork();
          continue;
        }
        // No free slot: every worker is awaiting a server response. Claiming now
        // would only park the row in memory with nowhere to run it, so wait —
        // a settling slot notifies us the moment it frees.
        const slot = this.workers().find((worker) => worker.isFree());
        if (!slot) {
          burstStartedAt = undefined;
          await this.waitForWork();
          continue;
        }
        const row = this.queue.claimNext(this.channelName);
        if (!row) {
          burstStartedAt = undefined;
          await this.waitForWork();
          continue;
        }

        // ── Partition gate (await-free) ────────────────────────────────────
        const key = this.computeKey(row.originalMessage);
        if (this.queue.isPartitionBlocked(this.channelName, key, row.id)) {
          // An earlier message in this logical channel is still in play. Park the
          // row `delayed` (undoing the claim's attempt bump) and move on; it
          // re-enters `queued` when that message settles (releasePartition) or on
          // a spec change / startup recovery. Never dispatched, so no ordering risk.
          this.queue.markDelayed(row.id, row.attemptCount, key);
        } else {
          // Partition is free: record the key so later same-partition claims see it
          // as occupied, and mirror it onto the in-memory row so releasePartition
          // wakes the right partition when this row settles.
          this.queue.setLogicalChannelKey(row.id, key);
          row.logicalChannelKey = key;
          slot.assign(row);
        }
        // ───────────────────────────────────────────────────────────────────

        // Neither branch above awaits: a park is pure DB work, and `assign` only
        // registers the dispatch before returning. So a deep backlog — or simply
        // filling a large pool — would otherwise run an unbroken run of claims in
        // ONE event-loop turn: no socket reads, no source ACKs, no WS heartbeat
        // replies, no chance to observe `stopping`, for as long as that takes.
        // Yield a real turn once a run has held the loop for the budget. The work
        // is unchanged, only spread out.
        burstStartedAt ??= Date.now();
        if (Date.now() - burstStartedAt >= this.loopYieldBudgetMs) {
          burstStartedAt = undefined;
          await yieldToEventLoop();
        }
      } catch (err) {
        if (err instanceof QueueLeaseError) {
          // A peer took the lease (detected at claimNext or a partition-gate
          // write). Stop claiming and step down. Any row we had mid-flight is
          // deliberately left untouched (`claimed`/`inflight`) for the new
          // leader's recoverOnStartup to reconcile — a demoted process must not
          // write dispatch state. The channel restarts us if we reacquire.
          this.log.info(`Dispatcher for channel '${this.channelName}' stepping down: queue lease taken by a peer.`);
          break;
        }
        // Caught per iteration, not around the loop: this dispatcher is the only
        // claimer for the channel, so letting one bad row's error unwind the loop
        // would stop the channel entirely. Log it and keep claiming, waiting first
        // so a persistent fault can't spin hot.
        this.log.error(
          `Dispatcher error on channel '${this.channelName}', continuing: ${normalizeErrorString(err)}`,
          err instanceof Error ? { error: err } : undefined
        );
        burstStartedAt = undefined;
        await this.waitForWork();
      }
    }
    this.running = false;
  }

  /**
   * Sleeps until there may be work: an explicit {@link notify}, or the idle poll.
   *
   * The poll is not just insurance against a missed wake. A row whose retry backoff
   * elapses becomes claimable with no event to announce it (`scheduleRetry` only
   * writes `next_attempt_at`), so this is what makes retries fire on time.
   */
  private async waitForWork(): Promise<void> {
    if (this.wakePending) {
      // Woken before we got here — go straight back around and look for work.
      this.wakePending = false;
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wakeWaiter = undefined;
        resolve();
      }, this.idlePollMs);
      // Node keeps the process alive for a pending timer; an idle dispatcher must
      // not be what holds the agent open during shutdown.
      timer.unref?.();
      this.wakeWaiter = () => {
        clearTimeout(timer);
        this.wakeWaiter = undefined;
        resolve();
      };
    });
    // `wakePending` is deliberately NOT cleared here. A notify that lands between
    // the wake above and the loop's next wait would otherwise be swallowed; leaving
    // it set costs one extra pass around the loop and can never lose a wake.
  }
}

/**
 * Yields one full event-loop turn. `setImmediate` (check phase) rather than a 0ms
 * timer: it resumes us after the poll phase, so pending socket reads and timers are
 * serviced first, and it costs none of the ~1ms a clamped `setTimeout(…, 0)` would
 * add to every yield of a long drain.
 * @returns A promise that resolves on the next turn of the event loop.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
