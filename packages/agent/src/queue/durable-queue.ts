// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ILogger } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';
import {
  CHANNEL_DEPTH,
  CHECKPOINT_WAL,
  CLAIM_NEXT,
  COMMIT_SEQ_NO,
  COUNT_BY_STATE,
  DB_SIZE_BYTES,
  ENQUEUE,
  ENQUEUE_REJECTED,
  FIND_BY_CALLBACK,
  FIND_BY_ID,
  FIND_SEEN_BY_CONTROL_ID,
  GET_LEASE,
  HEARTBEAT_LEASE,
  LIST_QUEUED_IDS_FOR_CHANNEL,
  MARK_BOT_FAILED,
  MARK_PROCESSED,
  MARK_SENT,
  PEEK_LAST_SEQ_NO,
  RECORD_SERVER_RESPONSE,
  RECOVER_CLAIMED,
  RECOVER_INFLIGHT,
  RELEASE_LEASE,
  REQUEUE,
  SET_ACK_OUTCOME,
  TRY_ACQUIRE_LEASE,
} from './queries';
import { runMigrations } from './schema';
import type {
  AckOutcome,
  EnqueueInput,
  EnqueueRejectedInput,
  EnqueueResult,
  InboundRow,
  MessageState,
  QueueErrorCode,
} from './types';
import { AckOutcome as AckOutcomeValues, MessageState as MessageStateValues, QueueLeaseError } from './types';

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

/**
 * How often the queue folds its WAL back into the main DB file. SQLite only
 * checkpoints piggybacked on commits, so once traffic stops nothing else would
 * drain the WAL until the next retention sweep or close(); this loop bounds how
 * far the main DB file can lag behind the last write. Matches the agent
 * heartbeat cadence — the loop's former home, before the queue took ownership.
 */
export const DEFAULT_CHECKPOINT_INTERVAL_MS = 10_000;

export interface DurableQueueOptions {
  /** Filesystem path to the SQLite DB file. */
  path: string;
  /** Logger for migration / lifecycle messages. */
  log: ILogger;
  /** Override the per-process dispatch-lease holder ID. Defaults to a fresh UUID. */
  leaseHolder?: string;
  /** Override the dispatch-lease TTL in ms. */
  leaseTtlMs?: number;
  /** Override the dispatch-lease heartbeat interval in ms. */
  leaseHeartbeatMs?: number;
  /** Override the dispatch-lease acquire retry interval in ms. */
  leaseAcquireRetryMs?: number;
  /** Override the WAL-checkpoint loop interval in ms. */
  checkpointIntervalMs?: number;
}

/** Counts by lifecycle state — used by stats and the retention sweeper. */
export type StateCounts = Record<MessageState, number>;

/** Per-channel queue depth snapshot returned by {@link DurableQueue.getChannelDepths}. */
export interface ChannelDepth {
  queued: number;
  /** Claimed by a worker but not yet written to the socket. */
  claimed: number;
  /** Written to the socket, awaiting the server response. */
  inflight: number;
  oldestQueuedAgeMs: number | null;
}

/**
 * SQLite-backed durable FIFO for inbound HL7 messages.
 *
 * One instance owns one synchronous `node:sqlite` connection plus a bag of
 * prepared statements covering the hot path. All channel intake and worker
 * dispatch goes through this object. See DURABLE_QUEUE_ARCHITECTURE.md §3, §5.
 *
 * The class is designed to be opened once at agent startup, used for the
 * lifetime of the process, and closed exactly once during {@link DurableQueue.close}.
 */
export class DurableQueue {
  private readonly db: DatabaseSync;
  private readonly log: ILogger;
  private readonly path: string;
  private closed = false;
  // The dispatch-lease holder ID of THIS process, set when startDispatchLease()
  // begins the acquire/heartbeat loop (or bound directly via setLeaseHolder in
  // tests). Dispatch-class mutations are gated on the live lease still belonging
  // to this holder; when a peer takes over, the gate throws QueueLeaseError so the
  // demoted worker stops driving the queue. Undefined when the dispatch lease was
  // never started (single-process use and most unit tests), in which case the gate
  // is inert because no lease row exists.
  private leaseHolderId: string | undefined;

  // ── Dispatch-lease orchestration (formerly DispatchLeaseManager) ──
  // Lightweight leader election for the DISPATCH path. The lease gates *dispatch
  // only* — claiming rows and driving them to the server (the worker +
  // recoverOnStartup). It deliberately does NOT gate intake (followers still
  // persist inbound messages via enqueue), maintenance (WAL checkpoint, retention
  // sweep), or diagnostics (stats): those are valid on any process with the queue
  // file open. Exactly one process may dispatch at a time, which is the
  // load-bearing primitive that makes zero-downtime upgrades safe: during the
  // overlap window where the old and new agent processes both have the SQLite file
  // open, only the leaseholder claims/sends rows; the non-leader keeps accepting
  // and persisting inbound traffic but does not dispatch.
  //
  // There is deliberately NO lost-leadership callback: loss is enforced at the
  // data layer instead — the dispatch ops throw QueueLeaseError once a peer holds
  // the lease (see assertNotDemoted), so the worker self-detects and drains
  // without pushing an event down a chain of callbacks.
  private readonly leaseTtlMs: number;
  private readonly leaseHeartbeatMs: number;
  private readonly leaseAcquireRetryMs: number;
  private leaseLeader = false;
  private leaseLoopActive = false;
  private leaseAcquireTimer: NodeJS.Timeout | undefined;
  private leaseHeartbeatTimer: NodeJS.Timeout | undefined;
  private onBecameLeader: (() => void) | undefined;
  // True when the WAL may contain frames not yet checkpointed into the main DB
  // file. SQLite only attempts checkpoints piggybacked on commits, so once
  // traffic stops nothing would ever drain the WAL — the queue's own checkpoint
  // loop (startCheckpointLoop) polls this via checkpointWalIfDirty(). Starts true
  // because open() itself writes (pragmas, migrations, lease).
  private walDirty = true;

  // WAL-checkpoint loop. Runs while the queue is open, INDEPENDENT of the
  // dispatch lease: a follower still accepts intake writes (enqueue runs on any
  // process with the file open), so WAL draining can't be gated on leadership the
  // way the lease timers are. Started in open(), cleared in close().
  private readonly checkpointIntervalMs: number;
  private checkpointTimer: NodeJS.Timeout | undefined;

  // Prepared statements — created once at open(), reused for every call.
  // Names mirror the public methods that use them.
  private readonly enqueueStmt: StatementSync;
  private readonly enqueueRejectedStmt: StatementSync;
  private readonly peekLastSeqNoStmt: StatementSync;
  private readonly commitSeqNoStmt: StatementSync;
  private readonly findSeenByControlIdStmt: StatementSync;
  private readonly claimNextStmt: StatementSync;
  private readonly markSentStmt: StatementSync;
  private readonly findByCallbackStmt: StatementSync;
  private readonly findByIdStmt: StatementSync;
  private readonly recordServerResponseStmt: StatementSync;
  private readonly markProcessedStmt: StatementSync;
  private readonly markBotFailedStmt: StatementSync;
  private readonly setAckOutcomeStmt: StatementSync;
  private readonly requeueStmt: StatementSync;
  private readonly recoverInflightStmt: StatementSync;
  private readonly recoverClaimedStmt: StatementSync;
  private readonly listQueuedIdsForChannelStmt: StatementSync;
  private readonly countByStateStmt: StatementSync;
  private readonly channelDepthStmt: StatementSync;
  private readonly tryAcquireLeaseStmt: StatementSync;
  private readonly heartbeatLeaseStmt: StatementSync;
  private readonly releaseLeaseStmt: StatementSync;
  private readonly getLeaseStmt: StatementSync;
  private readonly checkpointStmt: StatementSync;
  private readonly dbSizeBytesStmt: StatementSync;

  constructor(db: DatabaseSync, options: DurableQueueOptions) {
    this.db = db;
    this.log = options.log;
    this.path = options.path;
    this.leaseHolderId = options.leaseHolder;
    this.leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.leaseHeartbeatMs = options.leaseHeartbeatMs ?? DEFAULT_LEASE_HEARTBEAT_MS;
    this.leaseAcquireRetryMs = options.leaseAcquireRetryMs ?? DEFAULT_LEASE_ACQUIRE_RETRY_MS;
    this.checkpointIntervalMs = options.checkpointIntervalMs ?? DEFAULT_CHECKPOINT_INTERVAL_MS;

    // Single-writer, durable-across-crash, WAL-friendly settings (§5).
    // Picked for HL7 inbound rates and the durability contract we owe the sender:
    //   synchronous=NORMAL gives crash safety without per-write fsync;
    //   WAL lets workers read while intake writes;
    //   mmap_size keeps the read path off the kernel I/O hot path.
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous  = NORMAL;
      PRAGMA temp_store   = MEMORY;
      PRAGMA cache_size   = -65536;
      PRAGMA mmap_size    = 268435456;
      PRAGMA wal_autocheckpoint = 1000;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
    `);

    runMigrations(this.db);

    this.enqueueStmt = this.db.prepare(ENQUEUE);

    this.enqueueRejectedStmt = this.db.prepare(ENQUEUE_REJECTED);

    // Per-channel monotonic sequence counter (assignSeqNo). Single-process +
    // synchronous, so no locking is needed between peek and commit.
    this.peekLastSeqNoStmt = this.db.prepare(PEEK_LAST_SEQ_NO);
    this.commitSeqNoStmt = this.db.prepare(COMMIT_SEQ_NO);

    // Canonical prior row for a (channel, control_id): any state except `nacked`
    // (nacked rows are rejected-intake audit records and intentionally reuse
    // control IDs, so they're not a "real" prior delivery to dedupe against).
    // id DESC returns the most recent in the unlikely event legacy duplicates
    // predate the dedupe-on-intake logic.
    this.findSeenByControlIdStmt = this.db.prepare(FIND_SEEN_BY_CONTROL_ID);

    // FIFO claim: take the lowest-id queued row for this channel, flip it to
    // `claimed` in the same statement so concurrent workers can't double-claim.
    // node:sqlite is synchronous and the agent is single-process, so RETURNING is
    // enough — no advisory locking needed.
    this.claimNextStmt = this.db.prepare(CLAIM_NEXT);

    // Phase A → B: the App's send path calls this the moment the transmit request
    // is written to the socket, flipping `claimed` → `inflight` and stamping sent_at.
    this.markSentStmt = this.db.prepare(MARK_SENT);

    this.findByCallbackStmt = this.db.prepare(FIND_BY_CALLBACK);

    this.findByIdStmt = this.db.prepare(FIND_BY_ID);

    this.recordServerResponseStmt = this.db.prepare(RECORD_SERVER_RESPONSE);

    this.markProcessedStmt = this.db.prepare(MARK_PROCESSED);

    this.markBotFailedStmt = this.db.prepare(MARK_BOT_FAILED);

    this.setAckOutcomeStmt = this.db.prepare(SET_ACK_OUTCOME);

    this.requeueStmt = this.db.prepare(REQUEUE);

    // Crash recovery splits on whether the request reached the wire:
    //   recoverInflight — rows left `inflight` are ambiguous (the server may or
    //     may not have processed them), so they land in `failed` for operator
    //     review, never `rejected`. The source leg's ack_outcome is left as-is
    //     (`pending`): we genuinely don't know whether an ACK was owed.
    //   recoverClaimed — rows left `claimed` provably never reached the server,
    //     so they return to `queued` for a clean re-dispatch with no duplicate risk.
    this.recoverInflightStmt = this.db.prepare(RECOVER_INFLIGHT);
    this.recoverClaimedStmt = this.db.prepare(RECOVER_CLAIMED);

    this.listQueuedIdsForChannelStmt = this.db.prepare(LIST_QUEUED_IDS_FOR_CHANNEL);

    this.countByStateStmt = this.db.prepare(COUNT_BY_STATE);

    this.channelDepthStmt = this.db.prepare(CHANNEL_DEPTH);

    this.tryAcquireLeaseStmt = this.db.prepare(TRY_ACQUIRE_LEASE);

    this.heartbeatLeaseStmt = this.db.prepare(HEARTBEAT_LEASE);

    this.releaseLeaseStmt = this.db.prepare(RELEASE_LEASE);

    this.getLeaseStmt = this.db.prepare(GET_LEASE);

    // Prepared once like every other statement — checkpointWal() runs on every
    // checkpoint-loop tick and every retention sweep, so re-compiling it per call
    // would leak GC-finalised statement objects proportional to that frequency.
    this.checkpointStmt = this.db.prepare(CHECKPOINT_WAL);

    // Prepared once like the rest — the retention sweeper calls getDbSizeBytes()
    // in a tight loop while purging under size pressure, so re-compiling it per
    // call would leak GC-finalised statement objects proportional to sweep work.
    this.dbSizeBytesStmt = this.db.prepare(DB_SIZE_BYTES);
  }

  /**
   * Opens (or creates) the DB file at `options.path`, runs migrations, and
   * returns a ready DurableQueue.
   *
   * Constructs synchronously — `node:sqlite` is itself synchronous so there's
   * no benefit to making this `async`.
   *
   * @param options - Path + logger.
   * @returns The opened DurableQueue.
   */
  static open(options: DurableQueueOptions): DurableQueue {
    // Lazy require so this module can be imported in environments where
    // node:sqlite isn't available (e.g. type-only tooling).
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(options.path);
    const queue = new DurableQueue(db, options);
    // Lock the DB file down to the agent's user. Best-effort — fails silently on
    // platforms (Windows) where chmod is a no-op.
    if (existsSync(options.path)) {
      try {
        chmodSync(options.path, 0o600);
      } catch {
        // ignore
      }
    }
    // Start the WAL-checkpoint loop here (not in the constructor) so a bare
    // `new DurableQueue(db, opts)` — used by unit tests — stays timer-free; the
    // production lifecycle is open() … close(), and close() clears it.
    queue.startCheckpointLoop();
    return queue;
  }

  /** Closes the underlying SQLite handle. Idempotent. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    // Stop the WAL-checkpoint loop — the final flush below covers shutdown, and a
    // checkpointWalIfDirty() tick is a no-op once `closed` is set anyway.
    this.stopCheckpointLoop();
    // Release the lease BEFORE closing the DB so a waiting peer can take over
    // immediately rather than waiting for our TTL to expire. Idempotent and a
    // no-op when the dispatch lease was never started.
    this.stopDispatchLease();
    // SQLite only checkpoints + deletes the WAL on close when this is the last
    // connection to the file. An upgrade-overlap peer or an operator's sqlite3
    // shell defeats that, so flush explicitly — a clean shutdown should always
    // leave a self-contained main DB file (e.g. for file-level backups).
    this.checkpointWal();
    try {
      this.db.close();
    } catch (err) {
      this.log.warn(`Error while closing durable queue DB: ${normalizeErrorString(err)}`);
    }
  }

  /**
   * Unconditionally runs a TRUNCATE checkpoint, folding the WAL into the main
   * DB file and truncating the WAL to zero bytes. Best-effort: failures are
   * logged, and an incomplete checkpoint (a peer connection pinning part of the
   * WAL) leaves the dirty flag set so the next attempt retries.
   * @returns True when the checkpoint fully completed.
   */
  checkpointWal(): boolean {
    try {
      const row = this.checkpointStmt.get() as { busy: number } | undefined;
      if (row?.busy) {
        return false;
      }
      this.walDirty = false;
      return true;
    } catch (err) {
      this.log.warn(`wal_checkpoint failed: ${normalizeErrorString(err)}`);
      return false;
    }
  }

  /**
   * Runs {@link DurableQueue.checkpointWal} only when writes have landed since
   * the last completed checkpoint. Driven by the queue's own checkpoint loop
   * (see {@link DurableQueue.startCheckpointLoop}) every `checkpointIntervalMs`,
   * so the WAL drains shortly after traffic stops instead of waiting for the next
   * retention sweep or for close(). A no-op on an idle queue.
   * @returns True when a checkpoint ran and fully completed.
   */
  checkpointWalIfDirty(): boolean {
    if (this.closed || !this.walDirty) {
      return false;
    }
    return this.checkpointWal();
  }

  /**
   * Starts the periodic WAL-checkpoint loop. Idempotent. Called once by
   * {@link DurableQueue.open}; runs regardless of dispatch leadership (see the
   * `checkpointTimer` field) and is torn down by {@link DurableQueue.close}.
   */
  private startCheckpointLoop(): void {
    if (this.checkpointTimer) {
      return;
    }
    this.checkpointTimer = setInterval(() => this.checkpointWalIfDirty(), this.checkpointIntervalMs);
    // Don't keep the event loop alive solely for housekeeping — same as the
    // dispatch-lease timers.
    if (typeof this.checkpointTimer.unref === 'function') {
      this.checkpointTimer.unref();
    }
  }

  /** Stops the WAL-checkpoint loop. Idempotent and a no-op when never started. */
  private stopCheckpointLoop(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
      this.checkpointTimer = undefined;
    }
  }

  /** @returns Filesystem path of the underlying SQLite file. */
  getPath(): string {
    return this.path;
  }

  /** @returns Direct access to the underlying handle. Used by retention sweeper for PRAGMA queries. */
  getDb(): DatabaseSync {
    return this.db;
  }

  /**
   * Inserts a new `queued` row.
   *
   * If any prior non-`nacked` row already owns this `(channel_name,
   * msg_control_id)` — in `queued`, `claimed`, `inflight`, `processed`,
   * `rejected`, or `failed` — we don't insert; we surface a `duplicate` result
   * carrying that row so the caller can compare bodies and decide between
   * replaying the prior ACK and rejecting the collision (§8). This SELECT is the
   * single dedup authority on the intake path: the partial unique index only
   * covers the live `queued`/`claimed`/`inflight` window, so it can't recognize a
   * retransmit of an already-`processed`/`rejected`/`failed` row —
   * it remains only as a last-resort guard against an active-window race (not
   * expected in the single-process agent).
   * @param input - Fields to persist on the new row.
   * @param options - Optional behavior.
   * @param options.assignSeqNo - When provided, enqueue assigns the channel's next
   *   sequence number — but only after the duplicate check passes, so a retransmit
   *   never consumes one. It peeks the persisted counter (a non-consuming read),
   *   calls this callback with the candidate so the caller can stamp it into MSH.13
   *   and return the finalized bytes to persist, then advances the counter in the
   *   SAME transaction as the insert (so a crash can't store the row while leaving
   *   the counter behind, which would reuse the number on restart). On a duplicate
   *   the callback is never invoked.
   * @returns Either the inserted row, or the prior row that owns the MSH.10.
   */
  enqueue(input: EnqueueInput, options?: { assignSeqNo?: (candidate: number) => Buffer }): EnqueueResult {
    if (input.msgControlId) {
      const existing = this.findSeenByControlId(input.channelName, input.msgControlId);
      if (existing) {
        return { kind: 'duplicate', existing };
      }
    }

    // Not a duplicate — only now assign the sequence number (if configured). Peek
    // is non-consuming; the counter is advanced (commitSeqNo) inside the insert
    // transaction below, so a failed insert burns no number and a duplicate (above)
    // never reaches here.
    let finalizedMessage = input.finalizedMessage;
    let seqNo = input.seqNo;
    let seqNoToCommit: number | undefined;
    if (options?.assignSeqNo) {
      const candidate = this.peekNextSeqNo(input.channelName);
      finalizedMessage = options.assignSeqNo(candidate);
      seqNo = candidate;
      seqNoToCommit = candidate;
    }

    try {
      const runInsert = (): number => {
        const info = this.enqueueStmt.run(
          input.channelName,
          input.remote,
          input.msgControlId,
          input.msgType,
          toBlob(input.originalMessage),
          toBlob(finalizedMessage),
          input.encoding,
          input.enhancedMode,
          input.callbackId,
          seqNo,
          input.receivedAt
        );
        return Number(info.lastInsertRowid);
      };

      let id: number;
      if (seqNoToCommit !== undefined) {
        // Atomically insert the row and advance the sequence counter.
        this.db.exec('BEGIN');
        try {
          id = runInsert();
          this.commitSeqNo(input.channelName, seqNoToCommit);
          this.db.exec('COMMIT');
        } catch (txErr) {
          this.db.exec('ROLLBACK');
          throw txErr;
        }
      } else {
        id = runInsert();
      }
      this.walDirty = true;
      const row = this.getById(id);
      if (!row) {
        throw new Error(`enqueue: inserted row id=${id} could not be re-read`);
      }
      return { kind: 'inserted', row };
    } catch (err) {
      if (isUniqueConstraintError(err) && input.msgControlId) {
        const existing = this.findSeenByControlId(input.channelName, input.msgControlId);
        if (existing) {
          return { kind: 'duplicate', existing };
        }
      }
      throw err;
    }
  }

  /**
   * Inserts an audit row in the `nacked` terminal state — used when intake
   * rejected the message (duplicate, malformed) but we still want a forensics
   * record. Failure to write this is non-fatal; the caller is expected to log.
   * @param input - Fields to persist plus the `lastError`/`errorCode` describing why we rejected.
   * @returns The newly inserted audit row, or null if even the audit insert failed.
   */
  enqueueRejected(input: EnqueueRejectedInput): InboundRow | null {
    try {
      const info = this.enqueueRejectedStmt.run(
        input.channelName,
        input.remote,
        input.msgControlId,
        input.msgType,
        toBlob(input.originalMessage),
        toBlob(input.finalizedMessage),
        input.encoding,
        input.enhancedMode,
        input.callbackId,
        input.lastError,
        input.errorCode,
        input.seqNo,
        input.receivedAt
      );
      this.walDirty = true;
      return this.getById(Number(info.lastInsertRowid));
    } catch (err) {
      this.log.warn(`enqueueRejected failed: ${normalizeErrorString(err)}`);
      return null;
    }
  }

  /**
   * Atomically claims the next `queued` row for `channelName`, flipping it to
   * `claimed` and bumping `attempt_count`. The row stays `claimed` until
   * {@link markSent} flips it to `inflight` once the request hits the socket.
   * @param channelName - The channel to claim from.
   * @param now - Override the timestamp written to `processing_started_at` (for tests).
   * @returns The claimed row, or `null` if the channel queue is empty.
   */
  claimNext(channelName: string, now: number = Date.now()): InboundRow | null {
    this.assertNotDemoted();
    const raw = this.claimNextStmt.get(now, channelName) as Record<string, SQLInputValue> | undefined;
    if (raw) {
      this.walDirty = true;
    }
    return raw ? rowFromSql(raw) : null;
  }

  /**
   * Phase A → B transition: records that the transmit request for `callbackId`
   * was written to the WebSocket, flipping the row from `claimed` to `inflight`
   * and stamping `sent_at`. Called from the App's send path the instant the
   * request leaves the process — the durable marker that distinguishes a
   * provably-unsent row (safe to requeue on crash) from an ambiguous in-flight
   * one (failed for review). Guarded on `state = 'claimed'`, so it's a no-op for
   * legacy (non-durable) sends and for any row already past `claimed`.
   * @param callbackId - The callback ID of the transmit request just sent.
   * @param now - Override for `sent_at` (for tests).
   * @returns True if a `claimed` row was flipped to `inflight`.
   */
  markSent(callbackId: string, now: number = Date.now()): boolean {
    const info = this.markSentStmt.run(now, callbackId);
    if (Number(info.changes) > 0) {
      this.walDirty = true;
      return true;
    }
    return false;
  }

  /**
   * Looks up a row by its server-callback ID. Returns `null` if not found.
   * @param callbackId - The callback ID echoed back by the Medplum server.
   * @returns The matching row, or null.
   */
  findByCallback(callbackId: string): InboundRow | null {
    const raw = this.findByCallbackStmt.get(callbackId) as Record<string, SQLInputValue> | undefined;
    return raw ? rowFromSql(raw) : null;
  }

  /**
   * Looks up a row by its primary key.
   * @param id - The row's primary key.
   * @returns The matching row, or null.
   */
  getById(id: number): InboundRow | null {
    const raw = this.findByIdStmt.get(id) as Record<string, SQLInputValue> | undefined;
    return raw ? rowFromSql(raw) : null;
  }

  /**
   * Records the server's `agent:transmit:response` body + status against the row.
   * @param id - Row primary key.
   * @param statusCode - HTTP-style status code returned by the server.
   * @param body - Response payload, or null when the server omitted one.
   */
  recordServerResponse(id: number, statusCode: number | null, body: Buffer | string | null): void {
    this.assertNotDemoted();
    this.recordServerResponseStmt.run(statusCode, body === null ? null : toBlob(body), id);
    this.walDirty = true;
  }

  /**
   * Terminal Bot-leg transition: the server accepted the message (2xx). The
   * source leg is recorded independently via `ackOutcome` — `delivered` when the
   * app-level ACK reached the source, `undelivered` when it couldn't (e.g. the
   * source connection had closed). An `undelivered` row is fully processed
   * upstream and must never be re-dispatched; it recovers when the source
   * retransmits and the stored ACK is replayed (see {@link setAckOutcome}).
   * @param id - Row primary key.
   * @param ackOutcome - Source-leg result: `delivered` or `undelivered`.
   * @param now - Override for `processed_at` (for tests).
   */
  markProcessed(id: number, ackOutcome: AckOutcome, now: number = Date.now()): void {
    this.assertNotDemoted();
    this.markProcessedStmt.run(ackOutcome, now, id);
    this.walDirty = true;
  }

  /**
   * Terminal Bot-leg transition: the server **rejected** the message itself
   * (permanent 4xx). Retrying can never help — the content must be triaged.
   * @param id - Row primary key.
   * @param error - Human-readable error string, written to `last_error`.
   * @param errorCode - Machine-readable classification, written to `error_code`.
   * @param now - Override for `errored_at` (for tests).
   */
  markRejected(id: number, error: string, errorCode: QueueErrorCode, now: number = Date.now()): void {
    this.assertNotDemoted();
    this.markBotFailedStmt.run(MessageStateValues.REJECTED, now, error, errorCode, id);
    this.walDirty = true;
  }

  /**
   * Terminal-for-now Bot-leg transition: a **transient/ambiguous** failure
   * (5xx, 429, response timeout, dispatch error, interrupted). The retry/
   * operator-review candidate — distinct from a `rejected` message so a future
   * retry policy can re-dispatch `failed` rows without ever touching `rejected`
   * ones (or `processed` + `undelivered` ones, whose Bot leg already succeeded).
   * @param id - Row primary key.
   * @param error - Human-readable error string, written to `last_error`.
   * @param errorCode - Machine-readable classification, written to `error_code`.
   * @param now - Override for `errored_at` (for tests).
   */
  markFailed(id: number, error: string, errorCode: QueueErrorCode, now: number = Date.now()): void {
    this.assertNotDemoted();
    this.markBotFailedStmt.run(MessageStateValues.FAILED, now, error, errorCode, id);
    this.walDirty = true;
  }

  /**
   * Updates only the source-leg {@link AckOutcome}, leaving the Bot-leg `state`
   * untouched. Used when a duplicate retransmit replays a previously
   * `undelivered` ACK and it lands — flipping the row to `delivered` so it no
   * longer reads as awaiting source delivery.
   * @param id - Row primary key.
   * @param ackOutcome - The new source-leg outcome.
   */
  setAckOutcome(id: number, ackOutcome: AckOutcome): void {
    this.setAckOutcomeStmt.run(ackOutcome, id);
    this.walDirty = true;
  }

  /**
   * Returns a `claimed` row to `queued` — used when the WS connection drops
   * before the transmit request was ever written to the socket, so retrying on
   * reconnect carries no duplicate-delivery risk. (A row that already reached the
   * socket is `inflight`, not `claimed`, and this is a no-op for it — its outcome
   * is ambiguous and owned by the response timeout.) Because the row keeps its
   * original id and claims are ordered by id, it goes back to the front of its
   * channel's FIFO.
   * @param id - Row primary key.
   * @returns True if the row was requeued; false if it was not in `claimed`.
   */
  requeue(id: number): boolean {
    this.assertNotDemoted();
    const info = this.requeueStmt.run(id);
    if (Number(info.changes) > 0) {
      this.walDirty = true;
      return true;
    }
    return false;
  }

  /**
   * Recovers rows left mid-flight by a previous process, splitting on whether the
   * request reached the wire. Runs once at startup (§10):
   * - `inflight` rows are ambiguous (the server may have processed them) → `failed`
   *   with error code `interrupted`, surfaced for operator review, never silently retried.
   * - `claimed` rows provably never left the process (`sent_at` is NULL) → returned
   *   to `queued` for a clean re-dispatch with no duplicate-delivery risk.
   * @param now - Override for `errored_at` (for tests).
   * @returns Counts of `claimed` rows requeued and `inflight` rows failed.
   */
  recoverOnStartup(now: number = Date.now()): { requeued: number; failed: number } {
    const failedInfo = this.recoverInflightStmt.run(now);
    const requeuedInfo = this.recoverClaimedStmt.run();
    const failed = Number(failedInfo.changes);
    const requeued = Number(requeuedInfo.changes);
    if (failed > 0 || requeued > 0) {
      this.walDirty = true;
    }
    return { requeued, failed };
  }

  /**
   * Lists all `queued` row IDs for a channel, in FIFO order. Used by the
   * worker on startup to repopulate its in-memory wake signal.
   * @param channelName - The channel to query.
   * @returns Row IDs in FIFO order.
   */
  listQueuedIdsForChannel(channelName: string): number[] {
    const rows = this.listQueuedIdsForChannelStmt.all(channelName) as { id: number }[];
    return rows.map((r) => r.id);
  }

  /** @returns Counts of rows by state. Missing states are reported as 0. */
  countByState(): StateCounts {
    const counts: StateCounts = {
      queued: 0,
      claimed: 0,
      inflight: 0,
      processed: 0,
      rejected: 0,
      failed: 0,
      nacked: 0,
    };
    const rows = this.countByStateStmt.all() as { state: MessageState; n: number }[];
    for (const r of rows) {
      counts[r.state] = r.n;
    }
    return counts;
  }

  /**
   * @param channelName - The channel to query.
   * @param now - Override for the "now" timestamp used in `oldestQueuedAgeMs`.
   * @returns Depth snapshot for `channelName` (queued/claimed/inflight counts + oldest queued age).
   */
  getChannelDepth(channelName: string, now: number = Date.now()): ChannelDepth {
    const row = this.channelDepthStmt.get(channelName) as
      | { queued: number | null; claimed: number | null; inflight: number | null; oldest_queued_at: number | null }
      | undefined;
    return {
      queued: row?.queued ?? 0,
      claimed: row?.claimed ?? 0,
      inflight: row?.inflight ?? 0,
      oldestQueuedAgeMs: row?.oldest_queued_at ? now - row.oldest_queued_at : null,
    };
  }

  /**
   * Attempts to acquire (or re-acquire) the queue lease as `holder`.
   *
   * Succeeds when there is no current lease, the current lease is already held
   * by us (refresh case), or the prior holder's lease has expired. Fails when a
   * different holder still has a valid lease — caller should wait and retry.
   *
   * The lease is the cross-process coordination primitive that makes zero-downtime
   * upgrades safe: only the holder runs workers and `recoverOnStartup`, so two
   * processes sharing the DB during the upgrade overlap don't fight over rows.
   * @param holder - Stable identifier for this process (a per-process UUID).
   * @param ttlMs - How long the new lease should remain valid before another
   *                process can take over (also drives the heartbeat cadence).
   * @param now - Override the "now" timestamp (for tests).
   * @returns True if the lease is now held by `holder`; false if a foreign holder still owns it.
   */
  tryAcquireLease(holder: string, ttlMs: number, now: number = Date.now()): boolean {
    const expiresAt = now + ttlMs;
    const info = this.tryAcquireLeaseStmt.run(holder, now, expiresAt, holder, now);
    if (Number(info.changes) > 0) {
      this.walDirty = true;
    }
    return Number(info.changes) > 0;
  }

  /**
   * Extends the existing lease held by `holder`. Fails (returns false) when the
   * lease is no longer ours — most commonly because a peer took over after our
   * TTL elapsed. A leader that sees `false` here must stop driving the queue.
   * @param holder - The same identifier passed to {@link DurableQueue.tryAcquireLease}.
   * @param ttlMs - New TTL for the lease (added to `now`).
   * @param now - Override the "now" timestamp (for tests).
   * @returns True if the heartbeat extended our lease; false if we lost it.
   */
  heartbeatLease(holder: string, ttlMs: number, now: number = Date.now()): boolean {
    const info = this.heartbeatLeaseStmt.run(now + ttlMs, holder);
    if (Number(info.changes) > 0) {
      this.walDirty = true;
    }
    return Number(info.changes) > 0;
  }

  /**
   * Releases the lease if (and only if) `holder` still owns it. Idempotent. The
   * holder check means a process that already lost its lease won't accidentally
   * delete a newer leader's row.
   * @param holder - The identifier of the lease to release.
   */
  releaseLease(holder: string): void {
    const info = this.releaseLeaseStmt.run(holder);
    if (Number(info.changes) > 0) {
      this.walDirty = true;
    }
  }

  /**
   * @returns The current lease, or null if no row exists. Used for diagnostics
   *          and stats; the acquire/heartbeat methods do the actual coordination.
   */
  getCurrentLease(): { holder: string; expiresAt: number } | null {
    const row = this.getLeaseStmt.get() as { holder: string; expires_at: number } | undefined;
    return row ? { holder: row.holder, expiresAt: row.expires_at } : null;
  }

  /**
   * Binds this queue to the lease holder ID of the local process, so the
   * dispatch gate ({@link assertNotDemoted}) can tell "us" from a peer.
   * {@link startDispatchLease} sets this automatically; call it directly only in
   * tests that drive {@link tryAcquireLease}/{@link heartbeatLease} by hand.
   * @param holderId - This process's lease holder ID.
   */
  setLeaseHolder(holderId: string): void {
    this.leaseHolderId = holderId;
  }

  /**
   * Begins the dispatch-lease acquire-and-heartbeat loop for this process.
   *
   * Tries to acquire the lease immediately. On success it fires `onBecameLeader`
   * and begins heartbeating every `leaseHeartbeatMs`; on failure it retries every
   * `leaseAcquireRetryMs` until the lease frees up. `onBecameLeader` fires every
   * time this process transitions from follower to leader (typically once, but
   * again if it loses the lease mid-run and reclaims it). There is no
   * lost-leadership callback by design — loss surfaces as a {@link QueueLeaseError}
   * from the dispatch ops, which the worker catches to drain itself.
   *
   * Idempotent: calling it again while the loop is already active is a no-op, so
   * the App can call it on every heartbeat tick without restarting the loop.
   * @param onBecameLeader - Callback invoked when this process takes the lease.
   */
  startDispatchLease(onBecameLeader: () => void): void {
    if (this.leaseLoopActive) {
      return;
    }
    this.onBecameLeader = onBecameLeader;
    this.leaseLoopActive = true;
    if (!this.leaseHolderId) {
      this.leaseHolderId = randomUUID();
    }
    this.tryAcquireDispatchLease();
  }

  /**
   * Stops the dispatch-lease loop and releases the lease if we hold it.
   * Idempotent and a no-op when the loop was never started.
   * @returns True if we were the leader when stopping (and released the lease).
   */
  stopDispatchLease(): boolean {
    this.leaseLoopActive = false;
    this.onBecameLeader = undefined;
    this.clearLeaseAcquireTimer();
    this.clearLeaseHeartbeatTimer();
    const wasLeader = this.leaseLeader;
    if (this.leaseLeader && this.leaseHolderId) {
      try {
        this.releaseLease(this.leaseHolderId);
      } catch (err) {
        this.log.warn(`Failed to release queue lease: ${normalizeErrorString(err)}`);
      }
      this.leaseLeader = false;
    }
    return wasLeader;
  }

  /** @returns True if this process currently holds the dispatch lease. */
  isLeader(): boolean {
    return this.leaseLeader;
  }

  /** @returns The dispatch-lease holder ID for this process (for diagnostics), or undefined if never started. */
  getLeaseHolderId(): string | undefined {
    return this.leaseHolderId;
  }

  private tryAcquireDispatchLease(): void {
    if (!this.leaseLoopActive || this.closed || !this.leaseHolderId) {
      return;
    }
    let acquired = false;
    try {
      acquired = this.tryAcquireLease(this.leaseHolderId, this.leaseTtlMs);
    } catch (err) {
      this.log.warn(`Queue lease acquire threw: ${normalizeErrorString(err)}`);
    }

    if (acquired) {
      this.leaseLeader = true;
      this.clearLeaseAcquireTimer();
      this.log.info(`Acquired queue lease (holder=${this.leaseHolderId}).`);
      this.scheduleLeaseHeartbeat();
      // Fire callback last so any exception from it doesn't leave timers stopped.
      try {
        this.onBecameLeader?.();
      } catch (err) {
        this.log.error(`onBecameLeader callback threw: ${normalizeErrorString(err)}`);
      }
      return;
    }

    // Someone else holds the lease — try again in a bit.
    this.scheduleLeaseAcquireRetry();
  }

  private scheduleLeaseAcquireRetry(): void {
    if (!this.leaseLoopActive || this.leaseAcquireTimer) {
      return;
    }
    this.leaseAcquireTimer = setTimeout(() => {
      this.leaseAcquireTimer = undefined;
      this.tryAcquireDispatchLease();
    }, this.leaseAcquireRetryMs);
    if (typeof this.leaseAcquireTimer.unref === 'function') {
      this.leaseAcquireTimer.unref();
    }
  }

  private scheduleLeaseHeartbeat(): void {
    if (!this.leaseLoopActive || this.leaseHeartbeatTimer) {
      return;
    }
    this.leaseHeartbeatTimer = setInterval(() => this.leaseHeartbeat(), this.leaseHeartbeatMs);
    if (typeof this.leaseHeartbeatTimer.unref === 'function') {
      this.leaseHeartbeatTimer.unref();
    }
  }

  private leaseHeartbeat(): void {
    if (!this.leaseLoopActive || !this.leaseLeader || !this.leaseHolderId) {
      return;
    }
    let extended = false;
    try {
      extended = this.heartbeatLease(this.leaseHolderId, this.leaseTtlMs);
    } catch (err) {
      this.log.warn(`Queue lease heartbeat threw: ${normalizeErrorString(err)}`);
      return;
    }
    if (!extended) {
      // We lost the lease — a peer took over after our TTL elapsed. Drop back to
      // follower mode and start trying to reclaim it. We do NOT push a drain
      // event: the dispatch ops are bound to our holder and now throw
      // QueueLeaseError (a peer owns the lease), so the worker self-detects and
      // drains on its next claim/in-flight check — typically well before this
      // heartbeat even runs. (A small overlap window is inherent to TTL leases:
      // the peer could only acquire after our TTL expired.)
      this.log.error(`Lost queue lease (holder=${this.leaseHolderId}); peer took over.`);
      this.leaseLeader = false;
      this.clearLeaseHeartbeatTimer();
      this.scheduleLeaseAcquireRetry();
    }
  }

  private clearLeaseAcquireTimer(): void {
    if (this.leaseAcquireTimer) {
      clearTimeout(this.leaseAcquireTimer);
      this.leaseAcquireTimer = undefined;
    }
  }

  private clearLeaseHeartbeatTimer(): void {
    if (this.leaseHeartbeatTimer) {
      clearInterval(this.leaseHeartbeatTimer);
      this.leaseHeartbeatTimer = undefined;
    }
  }

  /**
   * @returns True when a lease row exists and a DIFFERENT holder owns it — i.e. a
   * peer has taken over and this process has been demoted. False when no lease
   * exists (no coordination in play) or the lease is ours. Note this intentionally
   * does NOT consider expiry: a merely-expired-but-still-ours lease will be
   * re-extended by our next heartbeat, so only a foreign holder means "demoted",
   * which keeps this exactly aligned with {@link DurableQueue.isLeader}.
   */
  isLeaseHeldByPeer(): boolean {
    const lease = this.getCurrentLease();
    return lease !== null && lease.holder !== this.leaseHolderId;
  }

  /**
   * Throws {@link QueueLeaseError} when a peer holds the lease. Called at the top
   * of every dispatch-class mutation so a demoted process can't claim, dispatch,
   * or settle rows the new leader now owns — the authoritative, data-layer half of
   * leadership enforcement (the {@link DurableQueue.isLeader} flag is the
   * cheap optimistic half). Intake, maintenance, diagnostics, and the physical
   * `markSent` marker are deliberately NOT gated.
   */
  private assertNotDemoted(): void {
    if (this.isLeaseHeldByPeer()) {
      throw new QueueLeaseError(this.leaseHolderId, this.getCurrentLease()?.holder);
    }
  }

  /**
   * @returns Size of the underlying database file in bytes, computed from
   * `page_count * page_size`. Used by the retention sweeper.
   */
  getDbSizeBytes(): number {
    const row = this.dbSizeBytesStmt.get() as { bytes: number } | undefined;
    return row?.bytes ?? 0;
  }

  /**
   * @param channelName - The channel to search.
   * @param msgControlId - MSH.10 to look up.
   * @returns The most recent non-`nacked` row owning this `(channel, control_id)`, or null.
   */
  findSeenByControlId(channelName: string, msgControlId: string): InboundRow | null {
    const raw = this.findSeenByControlIdStmt.get(channelName, msgControlId) as
      | Record<string, SQLInputValue>
      | undefined;
    return raw ? rowFromSql(raw) : null;
  }

  /**
   * Returns the sequence number that {@link commitSeqNo} would next persist for
   * a channel, WITHOUT advancing the counter. The first value for a channel is
   * 0; thereafter it is the last committed value + 1. Read-only: callers stamp
   * this candidate into MSH.13 and only {@link commitSeqNo} it once the row is
   * durably enqueued, so a failed insert never burns a sequence number.
   * @param channelName - The channel whose counter to peek.
   * @returns The next sequence number to assign.
   */
  peekNextSeqNo(channelName: string): number {
    const row = this.peekLastSeqNoStmt.get(channelName) as { last_seq_no: number } | undefined;
    return row === undefined ? 0 : row.last_seq_no + 1;
  }

  /**
   * Persists `seqNo` as the channel's last assigned sequence number. Production
   * intake commits this inside the insert transaction via
   * {@link enqueue}'s `commitSeqNo` option, so the row and the counter advance
   * atomically; call it directly only when not pairing it with an insert. The
   * counter survives restarts, keeping MSH.13 sequence numbers monotonic.
   * @param channelName - The channel whose counter to advance.
   * @param seqNo - The sequence number that was assigned and successfully enqueued.
   */
  commitSeqNo(channelName: string, seqNo: number): void {
    this.commitSeqNoStmt.run(channelName, seqNo);
    this.walDirty = true;
  }
}

/**
 * Decodes a raw SQL row into an {@link InboundRow}. Centralized so every read
 * path produces the same shape — adding a column means touching one place.
 * @param raw - The raw row object returned by `node:sqlite`.
 * @returns The decoded row.
 */
function rowFromSql(raw: Record<string, SQLInputValue>): InboundRow {
  return {
    id: raw.id as number,
    channelName: raw.channel_name as string,
    remote: raw.remote as string,
    msgControlId: (raw.msg_control_id as string | null) ?? null,
    msgType: (raw.msg_type as string | null) ?? null,
    originalMessage: toBuffer(raw.original_message),
    finalizedMessage: toBuffer(raw.finalized_message),
    encoding: (raw.encoding as string | null) ?? null,
    enhancedMode: (raw.enhanced_mode as 'standard' | 'aaMode' | null) ?? null,
    state: raw.state as MessageState,
    attemptCount: raw.attempt_count as number,
    callbackId: raw.callback_id as string,
    serverResponseBody:
      raw.server_response_body === null || raw.server_response_body === undefined
        ? null
        : toBuffer(raw.server_response_body),
    serverStatusCode: (raw.server_status_code as number | null) ?? null,
    ackOutcome: (raw.ack_outcome as AckOutcome | null) ?? AckOutcomeValues.PENDING,
    lastError: (raw.last_error as string | null) ?? null,
    errorCode: (raw.error_code as QueueErrorCode | null) ?? null,
    seqNo: (raw.seq_no as number | null) ?? null,
    receivedAt: raw.received_at as number,
    processingStartedAt: (raw.processing_started_at as number | null) ?? null,
    sentAt: (raw.sent_at as number | null) ?? null,
    processedAt: (raw.processed_at as number | null) ?? null,
    erroredAt: (raw.errored_at as number | null) ?? null,
  };
}

function toBlob(value: Buffer | string): Buffer {
  return typeof value === 'string' ? Buffer.from(value) : value;
}

function toBuffer(value: SQLInputValue): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === 'string') {
    return Buffer.from(value);
  }
  // SQLite NULL or unexpected — return empty to keep the shape stable; callers
  // that needed a value should have checked for null upstream.
  return Buffer.alloc(0);
}

/**
 * `node:sqlite` raises constraint failures as an Error whose message starts
 * with "UNIQUE constraint failed". On recent Node versions a `code` property
 * carries `ERR_SQLITE_CONSTRAINT_UNIQUE` (or `errcode = 2067`). We check all
 * three so we keep working when the property shape evolves and across test
 * runtimes (babel-jest can defeat `instanceof Error` checks).
 * @param err - Value caught from a `node:sqlite` call.
 * @returns True when the error represents a UNIQUE constraint failure.
 */
export function isUniqueConstraintError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') {
    return false;
  }
  const asAny = err as { code?: string; errcode?: number; message?: string };
  if (typeof asAny.code === 'string' && asAny.code.includes('CONSTRAINT_UNIQUE')) {
    return true;
  }
  // SQLITE_CONSTRAINT_UNIQUE extended result code.
  if (asAny.errcode === 2067) {
    return true;
  }
  if (typeof asAny.message === 'string' && /UNIQUE constraint failed/i.test(asAny.message)) {
    return true;
  }
  return false;
}

// Re-export so callers don't need to import from two modules.
export { MessageStateValues as MessageState };
