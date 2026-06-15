// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ILogger } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import { chmodSync, existsSync } from 'node:fs';
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';
import {
  CLAIM_NEXT,
  FIND_BY_CALLBACK,
  FIND_SEEN_BY_CONTROL_ID,
  LIST_QUEUED_IDS_FOR_CHANNEL,
  RECOVER_PROCESSING,
  RECOVER_PROCESSING_GUARANTEED,
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
import { AckOutcome as AckOutcomeValues, MessageState as MessageStateValues } from './types';

export interface DurableQueueOptions {
  /** Filesystem path to the SQLite DB file. */
  path: string;
  /** Logger for migration / lifecycle messages. */
  log: ILogger;
}

/** Counts by lifecycle state — used by stats and the retention sweeper. */
export type StateCounts = Record<MessageState, number>;

/** Per-channel queue depth snapshot returned by {@link DurableQueue.getChannelDepths}. */
export interface ChannelDepth {
  queued: number;
  processing: number;
  oldestQueuedAgeMs: number | null;
}

/**
 * SQLite-backed durable FIFO for inbound HL7 messages.
 *
 * One instance owns one synchronous `node:sqlite` connection plus a bag of
 * prepared statements covering the hot path. All channel intake and worker
 * dispatch goes through this object. See DURABLE_QUEUE_PLAN.md §3, §5.
 *
 * The class is designed to be opened once at agent startup, used for the
 * lifetime of the process, and closed exactly once during {@link DurableQueue.close}.
 */
export class DurableQueue {
  private readonly db: DatabaseSync;
  private readonly log: ILogger;
  private readonly path: string;
  private closed = false;
  // True when the WAL may contain frames not yet checkpointed into the main DB
  // file. SQLite only attempts checkpoints piggybacked on commits, so once
  // traffic stops nothing would ever drain the WAL — the App polls this on every
  // heartbeat tick via checkpointWalIfDirty(). Starts true because open() itself
  // writes (pragmas, migrations, lease).
  private walDirty = true;

  // Prepared statements — created once at open(), reused for every call.
  // Names mirror the public methods that use them.
  private readonly enqueueStmt: StatementSync;
  private readonly enqueueRejectedStmt: StatementSync;
  private readonly peekLastSeqNoStmt: StatementSync;
  private readonly commitSeqNoStmt: StatementSync;
  private readonly findSeenByControlIdStmt: StatementSync;
  private readonly claimNextStmt: StatementSync;
  private readonly findByCallbackStmt: StatementSync;
  private readonly findByIdStmt: StatementSync;
  private readonly recordServerResponseStmt: StatementSync;
  private readonly markProcessedStmt: StatementSync;
  private readonly markBotFailedStmt: StatementSync;
  private readonly setAckOutcomeStmt: StatementSync;
  private readonly scheduleRetryStmt: StatementSync;
  private readonly requeueStmt: StatementSync;
  private readonly recoverProcessingStmt: StatementSync;
  private readonly recoverProcessingGuaranteedStmt: StatementSync;
  private readonly listQueuedIdsForChannelStmt: StatementSync;
  private readonly countByStateStmt: StatementSync;
  private readonly channelDepthStmt: StatementSync;
  private readonly tryAcquireLeaseStmt: StatementSync;
  private readonly heartbeatLeaseStmt: StatementSync;
  private readonly releaseLeaseStmt: StatementSync;
  private readonly getLeaseStmt: StatementSync;

  constructor(db: DatabaseSync, options: DurableQueueOptions) {
    this.db = db;
    this.log = options.log;
    this.path = options.path;

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

    this.enqueueStmt = this.db.prepare(`
      INSERT INTO inbound_hl7_messages (
        channel_name, remote, msg_control_id, msg_type, original_message, finalized_message, encoding,
        enhanced_mode, state, attempt_count, callback_id,
        seq_no, received_at, guaranteed_delivery
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?
      )
    `);

    this.enqueueRejectedStmt = this.db.prepare(`
      INSERT INTO inbound_hl7_messages (
        channel_name, remote, msg_control_id, msg_type, original_message, finalized_message, encoding,
        enhanced_mode, state, attempt_count, callback_id,
        ack_outcome, last_error, seq_no, received_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, 'nacked', 0, ?, 'not_owed', ?, ?, ?
      )
    `);

    // Per-channel monotonic sequence counter (assignSeqNo). peek is a pure read
    // of the last assigned value; commit advances it. They're split (rather than
    // a single advance-and-return) so the caller can stamp a candidate sequence
    // number and only commit it once the row is durably inserted — a failed
    // insert never consumes a sequence number. Single-process + synchronous, so
    // no locking is needed between peek and commit.
    this.peekLastSeqNoStmt = this.db.prepare(`
      SELECT last_seq_no FROM _channel_seq WHERE channel_name = ?
    `);
    this.commitSeqNoStmt = this.db.prepare(`
      INSERT INTO _channel_seq (channel_name, last_seq_no) VALUES (?, ?)
        ON CONFLICT(channel_name) DO UPDATE SET last_seq_no = excluded.last_seq_no
    `);

    // Canonical prior row for a (channel, control_id): any state except `nacked`
    // (nacked rows are rejected-intake audit records and intentionally reuse
    // control IDs, so they're not a "real" prior delivery to dedupe against).
    // id DESC returns the most recent in the unlikely event legacy duplicates
    // predate the dedupe-on-intake logic.
    this.findSeenByControlIdStmt = this.db.prepare(FIND_SEEN_BY_CONTROL_ID);

    // FIFO claim: take the lowest-id queued row for this channel, flip it to
    // processing in the same statement so concurrent workers can't double-claim.
    // node:sqlite is synchronous and the agent is single-process, so RETURNING is
    // enough — no advisory locking needed. The retry-backoff predicate lives on
    // the OUTER update (see CLAIM_NEXT) so a head row waiting out its backoff
    // blocks the channel rather than letting younger rows skip ahead — that
    // head-of-line blocking is what preserves per-channel FIFO across retries.
    this.claimNextStmt = this.db.prepare(CLAIM_NEXT);

    this.findByCallbackStmt = this.db.prepare(FIND_BY_CALLBACK);

    this.findByIdStmt = this.db.prepare(`
      SELECT * FROM inbound_hl7_messages WHERE id = ?
    `);

    this.recordServerResponseStmt = this.db.prepare(`
      UPDATE inbound_hl7_messages
         SET server_status_code = ?,
             server_response_body = ?
       WHERE id = ?
    `);

    // Bot accepted (2xx). state → processed regardless of the source leg; the
    // caller passes the ack_outcome (delivered / undelivered) separately so a
    // failed return ACK is recorded on its own axis, never as a Bot-leg error.
    this.markProcessedStmt = this.db.prepare(`
      UPDATE inbound_hl7_messages
         SET state = 'processed',
             ack_outcome = ?,
             processed_at = ?
       WHERE id = ?
    `);

    // Bot-leg failure: state is the caller-supplied terminal (`rejected` for a
    // permanent reject, `failed` for transient/ambiguous). No app-level ACK is
    // owed in either case, so the source leg settles to not_owed.
    this.markBotFailedStmt = this.db.prepare(`
      UPDATE inbound_hl7_messages
         SET state = ?,
             errored_at = ?,
             last_error = ?,
             error_code = ?,
             ack_outcome = 'not_owed'
       WHERE id = ?
    `);

    // Source leg only: used when a retransmit replays a previously-undelivered
    // ACK and lands it, flipping the row's ack_outcome without touching state.
    this.setAckOutcomeStmt = this.db.prepare(`
      UPDATE inbound_hl7_messages
         SET ack_outcome = ?
       WHERE id = ?
    `);

    // Auto-retry transition: processing → queued with a future next_attempt_at.
    // The row keeps its id, so it stays at the head of its channel's FIFO; the
    // claim statement won't hand it out again until the backoff elapses. Note
    // the row goes back to `queued`, NOT to a terminal `failed`/`rejected` — a
    // scheduled retry is still in flight. attempt_count is NOT touched here —
    // claimNext already counted the attempt.
    this.scheduleRetryStmt = this.db.prepare(`
      UPDATE inbound_hl7_messages
         SET state = 'queued',
             processing_started_at = NULL,
             last_error = ?,
             error_code = ?,
             next_attempt_at = ?
       WHERE id = ? AND state = 'processing'
    `);

    // Undo of claimNext for a dispatch that provably never left the process
    // (the transmit request was still sitting in the in-memory WS queue when
    // the connection dropped). The attempt_count decrement keeps the counter
    // meaning "times the message could have reached the server".
    this.requeueStmt = this.db.prepare(`
      UPDATE inbound_hl7_messages
         SET state = 'queued',
             processing_started_at = NULL,
             attempt_count = MAX(0, attempt_count - 1)
       WHERE id = ? AND state = 'processing'
    `);

    // Interrupted mid-flight: ambiguous (the server may or may not have processed
    // it), so it lands in `failed` for operator review — never `rejected`. The
    // source leg's ack_outcome is left as-is (`pending`): we genuinely don't know
    // whether an ACK was owed. Non-guaranteed channels stop here: `interrupted`
    // is an ambiguous code, so it is review-only, never silently auto-retried.
    this.recoverProcessingStmt = this.db.prepare(RECOVER_PROCESSING);

    // Guaranteed-delivery counterpart of the recovery sweep: the operator asked
    // us to keep trying until upstream gives a definitive answer, so an
    // interrupted row goes straight back to the head of its channel's FIFO
    // (duplication risk accepted) instead of parking in `failed`. next_attempt_at
    // is cleared so it is immediately claimable on restart.
    this.recoverProcessingGuaranteedStmt = this.db.prepare(RECOVER_PROCESSING_GUARANTEED);

    this.listQueuedIdsForChannelStmt = this.db.prepare(LIST_QUEUED_IDS_FOR_CHANNEL);

    this.countByStateStmt = this.db.prepare(`
      SELECT state, COUNT(*) AS n FROM inbound_hl7_messages GROUP BY state
    `);

    this.channelDepthStmt = this.db.prepare(`
      SELECT
        SUM(state = 'queued')                                            AS queued,
        SUM(state = 'processing')                                        AS processing,
        MIN(CASE WHEN state = 'queued' THEN received_at ELSE NULL END)   AS oldest_queued_at
      FROM inbound_hl7_messages
      WHERE channel_name = ?
    `);

    // Lease acquire — upsert that succeeds only if no current lease, or if the
    // current lease is held by us, or if it has expired. The WHERE clause on the
    // ON CONFLICT branch is the gate: a foreign holder with a still-valid lease
    // makes the UPDATE a no-op, and `changes()` returning 0 tells the caller they
    // didn't get it. Bound parameters (in order): holder, now, expires_at, holder, now.
    this.tryAcquireLeaseStmt = this.db.prepare(`
      INSERT INTO _lease (id, holder, acquired_at, expires_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE
         SET holder = excluded.holder,
             acquired_at = excluded.acquired_at,
             expires_at = excluded.expires_at
       WHERE _lease.holder = ? OR _lease.expires_at <= ?
    `);

    // Heartbeat — extends our own lease. Fails (returns 0 changes) if the lease
    // is now held by someone else, which is how a stale leader learns it lost.
    this.heartbeatLeaseStmt = this.db.prepare(`
      UPDATE _lease SET expires_at = ? WHERE id = 1 AND holder = ?
    `);

    this.releaseLeaseStmt = this.db.prepare(`
      DELETE FROM _lease WHERE id = 1 AND holder = ?
    `);

    this.getLeaseStmt = this.db.prepare(`SELECT holder, expires_at FROM _lease WHERE id = 1`);
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
    return queue;
  }

  /** Closes the underlying SQLite handle. Idempotent. */
  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
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
      const row = this.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as { busy: number } | undefined;
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
   * the last completed checkpoint. Called by the App on every agent heartbeat
   * tick so the WAL drains shortly after traffic stops instead of waiting for
   * the next retention sweep or for close(). A no-op on an idle queue.
   * @returns True when a checkpoint ran and fully completed.
   */
  checkpointWalIfDirty(): boolean {
    if (this.closed || !this.walDirty) {
      return false;
    }
    return this.checkpointWal();
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
   * msg_control_id)` — in `queued`, `processing`, `processed`, `rejected`, or
   * `failed` — we don't insert; we surface a `duplicate` result carrying that row so the
   * caller can compare bodies and decide between replaying the prior ACK and
   * rejecting the collision (§8). This SELECT is the single dedup authority on the
   * intake path: the partial unique index only covers `queued`/`processing`, so it
   * can't recognize a retransmit of an already-`processed`/`rejected`/`failed` row —
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
          input.receivedAt,
          input.guaranteedDelivery ? 1 : 0
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
   * @param input - Fields to persist plus the `lastError` describing why we rejected.
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
   * `processing` and bumping `attempt_count`.
   * @param channelName - The channel to claim from.
   * @param now - Override the timestamp written to `processing_started_at` (for tests).
   * @returns The claimed row, or `null` if the channel queue is empty.
   */
  claimNext(channelName: string, now: number = Date.now()): InboundRow | null {
    // Bind `now` twice: once for processing_started_at, once for the
    // next_attempt_at backoff predicate on the outer update.
    const raw = this.claimNextStmt.get(now, channelName, now) as Record<string, SQLInputValue> | undefined;
    if (raw) {
      this.walDirty = true;
    }
    return raw ? rowFromSql(raw) : null;
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
    this.markBotFailedStmt.run(MessageStateValues.REJECTED, now, error, errorCode, id);
    this.walDirty = true;
  }

  /**
   * Terminal-for-now Bot-leg transition: a **transient/ambiguous** failure
   * (5xx, 429, response timeout, dispatch error, interrupted). The retry/
   * operator-review candidate — distinct from a `rejected` message so the retry
   * policy can re-dispatch `failed` rows (via {@link scheduleRetry}) without ever
   * touching `rejected` ones (or `processed` + `undelivered` ones, whose Bot leg
   * already succeeded). Used only for failures the policy is NOT retrying — a
   * retry routes through {@link scheduleRetry} instead, keeping the row `queued`.
   * @param id - Row primary key.
   * @param error - Human-readable error string, written to `last_error`.
   * @param errorCode - Machine-readable classification, written to `error_code`.
   * @param now - Override for `errored_at` (for tests).
   */
  markFailed(id: number, error: string, errorCode: QueueErrorCode, now: number = Date.now()): void {
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
   * Auto-retry transition: returns a `processing` row to `queued`, scheduled to
   * become claimable at `nextAttemptAt`. Because the row keeps its id and claims
   * are ordered by id, it sits at the head of its channel's FIFO and blocks
   * younger rows until it either succeeds or exhausts its attempts — preserving
   * per-channel ordering across retries.
   *
   * Distinct from {@link markFailed}: a retry stays `queued` (still in flight),
   * whereas `markFailed` is the terminal landing for a failure the policy is not
   * retrying. The worker decides which to call by gating the row's
   * {@link QueueErrorCode} against the retry policy (see worker.ts).
   * @param id - Row primary key.
   * @param error - Human-readable error string, written to `last_error`.
   * @param errorCode - Machine-readable classification, written to `error_code`.
   * @param nextAttemptAt - Earliest timestamp (ms) at which the row may be claimed again.
   * @returns True if the row was rescheduled; false if it was not in `processing`.
   */
  scheduleRetry(id: number, error: string, errorCode: QueueErrorCode, nextAttemptAt: number): boolean {
    const info = this.scheduleRetryStmt.run(error, errorCode, nextAttemptAt, id);
    if (Number(info.changes) > 0) {
      this.walDirty = true;
      return true;
    }
    return false;
  }

  /**
   * Returns a `processing` row to `queued` — used when the WS connection drops
   * before the in-flight transmit request was ever written to the socket, so
   * retrying on reconnect carries no duplicate-delivery risk. Because the row
   * keeps its original id and claims are ordered by id, the row goes back to
   * the front of its channel's FIFO.
   * @param id - Row primary key.
   * @returns True if the row was requeued; false if it was not in `processing`.
   */
  requeue(id: number): boolean {
    const info = this.requeueStmt.run(id);
    if (Number(info.changes) > 0) {
      this.walDirty = true;
      return true;
    }
    return false;
  }

  /**
   * Startup sweep over rows interrupted mid-dispatch (still in `processing`).
   *
   * Non-guaranteed rows are promoted to `failed` with error code `interrupted`
   * so they surface for operator review instead of being silently retried (§10)
   * — `interrupted` is an ambiguous code (delivery unknown) and those channels
   * haven't accepted duplication risk. Guaranteed-delivery rows are returned to
   * `queued` so the channel keeps trying until upstream gives a definitive
   * answer (§4.1).
   * @param now - Override for `errored_at` (for tests).
   * @returns Counts of rows promoted to `failed` and requeued, respectively.
   */
  recoverOnStartup(now: number = Date.now()): { failed: number; requeued: number } {
    const failed = Number(this.recoverProcessingStmt.run(now).changes);
    const requeued = Number(this.recoverProcessingGuaranteedStmt.run().changes);
    if (failed > 0 || requeued > 0) {
      this.walDirty = true;
    }
    return { failed, requeued };
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
      processing: 0,
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
   * @returns Depth snapshot for `channelName` (queued/processing counts + oldest queued age).
   */
  getChannelDepth(channelName: string, now: number = Date.now()): ChannelDepth {
    const row = this.channelDepthStmt.get(channelName) as
      | { queued: number | null; processing: number | null; oldest_queued_at: number | null }
      | undefined;
    return {
      queued: row?.queued ?? 0,
      processing: row?.processing ?? 0,
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
   * @returns Size of the underlying database file in bytes, computed from
   * `page_count * page_size`. Used by the retention sweeper.
   */
  getDbSizeBytes(): number {
    const row = this.db
      .prepare('SELECT page_count * page_size AS bytes FROM pragma_page_count, pragma_page_size')
      .get() as { bytes: number } | undefined;
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
    guaranteedDelivery: (raw.guaranteed_delivery as number) === 1,
    callbackId: raw.callback_id as string,
    serverResponseBody:
      raw.server_response_body === null || raw.server_response_body === undefined
        ? null
        : toBuffer(raw.server_response_body),
    serverStatusCode: (raw.server_status_code as number | null) ?? null,
    ackOutcome: (raw.ack_outcome as AckOutcome | null) ?? AckOutcomeValues.PENDING,
    lastError: (raw.last_error as string | null) ?? null,
    errorCode: (raw.error_code as QueueErrorCode | null) ?? null,
    nextAttemptAt: (raw.next_attempt_at as number | null) ?? null,
    seqNo: (raw.seq_no as number | null) ?? null,
    receivedAt: raw.received_at as number,
    processingStartedAt: (raw.processing_started_at as number | null) ?? null,
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
