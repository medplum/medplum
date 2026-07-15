// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { QueueErrorCode } from './types';

/**
 * Every SQL statement run by {@link DurableQueue} and {@link RetentionSweeper},
 * as named constants. Two reasons they live here rather than inline at the
 * `prepare()` call site:
 *
 * 1. The implementation and the `EXPLAIN QUERY PLAN` regression guards in
 *    `query-plan.test.ts` reference the *exact same* SQL text. If an
 *    index-sensitive query changes shape, the plan test re-checks its index
 *    against the change automatically — the two can never silently drift.
 * 2. Keeping the SQL in one module gives a single, scannable picture of every
 *    table access the queue makes, and keeps `durable-queue.ts` focused on
 *    behavior rather than embedded SQL.
 *
 * Not every query depends on an index — statements that resolve a row by its
 * INTEGER PRIMARY KEY (findById, markProcessed, requeue, …) or hit a
 * single-row/PK table (`_lease`, `_channel_seq`) need no index beyond the rowid,
 * so only the index-sensitive subset (called out below) is covered by
 * `query-plan.test.ts`.
 */

// --- Intake ---

/** Insert a new `queued` row. Column order matches {@link DurableQueue.enqueue}'s bind order. */
export const ENQUEUE = `
  INSERT INTO inbound_hl7_messages (
    channel_name, remote, msg_control_id, msg_type, original_message, finalized_message, encoding,
    enhanced_mode, state, attempt_count, callback_id,
    seq_no, received_at, guaranteed_delivery
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?
  )
`;

/**
 * Insert an audit row already in the `nacked` terminal state — used when intake
 * rejected the message but we still want a forensics record. `ack_outcome` is
 * fixed to `not_owed` since no app-level ACK is owed for a rejected message.
 */
export const ENQUEUE_REJECTED = `
  INSERT INTO inbound_hl7_messages (
    channel_name, remote, msg_control_id, msg_type, original_message, finalized_message, encoding,
    enhanced_mode, state, attempt_count, callback_id,
    ack_outcome, last_error, error_code, seq_no, received_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, 'nacked', 0, ?, 'not_owed', ?, ?, ?, ?
  )
`;

// --- Per-channel sequence counter ---
//
// peek is a pure read of the last assigned value; commit advances it. They're
// split (rather than a single advance-and-return) so the caller can stamp a
// candidate sequence number and only commit it once the row is durably inserted —
// a failed insert never consumes a sequence number.

/** Read the last assigned sequence number for a channel (single-row PK table). */
export const PEEK_LAST_SEQ_NO = `
  SELECT last_seq_no FROM _channel_seq WHERE channel_name = ?
`;

/** Advance (upsert) the channel's last assigned sequence number. */
export const COMMIT_SEQ_NO = `
  INSERT INTO _channel_seq (channel_name, last_seq_no) VALUES (?, ?)
    ON CONFLICT(channel_name) DO UPDATE SET last_seq_no = excluded.last_seq_no
`;

// --- Hot path (per inbound message / per worker tick) ---

/**
 * Intake dedup: most recent prior row for a (channel, control_id) in any
 * non-`nacked` state. Served by `idx_inbound_dup_lookup`. [index-guarded]
 */
export const FIND_SEEN_BY_CONTROL_ID = `
  SELECT * FROM inbound_hl7_messages
   WHERE channel_name = ?
     AND msg_control_id = ?
     AND state != 'nacked'
   ORDER BY id DESC
   LIMIT 1
`;

/**
 * FIFO claim: flip the lowest-id queued row for a channel to `claimed` in one
 * statement. The row stays `claimed` until {@link MARK_SENT} flips it to
 * `inflight` once the request is written to the socket. The inner SELECT is
 * served by `idx_inbound_channel_state_id`. [index-guarded]
 *
 * The `next_attempt_at` backoff predicate sits on the OUTER update, not the
 * inner select, on purpose: a head row still waiting out its retry backoff
 * blocks the whole channel (claim returns null) instead of letting younger rows
 * skip ahead. That head-of-line blocking preserves the per-channel FIFO
 * ordering guarantee across retries (see {@link SCHEDULE_RETRY}). The claim also
 * clears `next_attempt_at` so a re-claimed retry row carries no stale schedule,
 * and clears `last_error`/`error_code` so a crash during THIS attempt records a
 * fresh `interrupted` classification instead of the previous attempt's stale
 * code (see `RECOVER_INFLIGHT`'s `COALESCE`).
 */
export const CLAIM_NEXT = `
  UPDATE inbound_hl7_messages
     SET state = 'claimed',
         processing_started_at = ?,
         attempt_count = attempt_count + 1,
         next_attempt_at = NULL,
         last_error = NULL,
         error_code = NULL
   WHERE id = (
     SELECT id FROM inbound_hl7_messages
      WHERE channel_name = ? AND state = 'queued'
      ORDER BY id ASC
      LIMIT 1
   )
   AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
   RETURNING *
`;

/**
 * Phase A → B: the transmit request was written to the socket, so flip the
 * `claimed` row to `inflight` and stamp `sent_at`. Keyed by callback id (served
 * by `uq_inbound_callback`). The `state = 'claimed'` guard makes it a no-op for
 * legacy (non-durable) sends and for any row already past `claimed`. [index-guarded]
 */
export const MARK_SENT = `
  UPDATE inbound_hl7_messages
     SET state = 'inflight',
         sent_at = ?
   WHERE callback_id = ? AND state = 'claimed'
`;

/** Late server-response lookup by callback id. Served by `uq_inbound_callback`. [index-guarded] */
export const FIND_BY_CALLBACK = `
  SELECT * FROM inbound_hl7_messages WHERE callback_id = ?
`;

/** Lookup by primary key. */
export const FIND_BY_ID = `
  SELECT * FROM inbound_hl7_messages WHERE id = ?
`;

// --- Row lifecycle transitions (all keyed by primary key) ---

/** Record the server's `agent:transmit:response` status + body against the row. */
export const RECORD_SERVER_RESPONSE = `
  UPDATE inbound_hl7_messages
     SET server_status_code = ?,
         server_response_body = ?
   WHERE id = ?
`;

/**
 * Bot accepted (2xx). state → processed regardless of the source leg; the caller
 * passes the ack_outcome (delivered / undelivered) separately so a failed return
 * ACK is recorded on its own axis, never as a Bot-leg error.
 *
 * The `attempt_count = ?` guard makes this write attempt-scoped: it only applies
 * if the row is still on the exact attempt this response answers. A superseded
 * attempt (a newer claim has already bumped `attempt_count`, or a peer took the
 * dispatch lease) leaves the row untouched instead of settling it from a stale
 * outcome — see the correlation note on {@link SCHEDULE_RETRY}.
 */
export const MARK_PROCESSED = `
  UPDATE inbound_hl7_messages
     SET state = 'processed',
         ack_outcome = ?,
         processed_at = ?
   WHERE id = ? AND attempt_count = ?
`;

/**
 * Bot-leg failure: state is the caller-supplied terminal (`rejected` for a
 * permanent reject, `failed` for transient/ambiguous). No app-level ACK is owed
 * in either case, so the source leg settles to not_owed. (When the failure code
 * DOES carry a real app-level ACK to relay — a definitive upstream reject — the
 * caller relays it and overwrites `ack_outcome` via {@link SET_ACK_OUTCOME}
 * afterward; see `handleFailure` in worker.ts.)
 *
 * `attempt_count = ?` guard: see {@link MARK_PROCESSED}.
 */
export const MARK_BOT_FAILED = `
  UPDATE inbound_hl7_messages
     SET state = ?,
         errored_at = ?,
         last_error = ?,
         error_code = ?,
         ack_outcome = 'not_owed'
   WHERE id = ? AND attempt_count = ?
`;

/**
 * Source leg only: used when a retransmit replays a previously-undelivered ACK
 * and lands it, flipping the row's ack_outcome without touching state.
 */
export const SET_ACK_OUTCOME = `
  UPDATE inbound_hl7_messages
     SET ack_outcome = ?
   WHERE id = ?
`;

/**
 * Undo of {@link CLAIM_NEXT} for a dispatch that provably never left the process
 * (the transmit request was still sitting in the in-memory WS queue when the
 * connection dropped, so the row is still `claimed`, never `inflight`). The
 * attempt_count decrement keeps the counter meaning "times the message could
 * have reached the server".
 */
export const REQUEUE = `
  UPDATE inbound_hl7_messages
     SET state = 'queued',
         processing_started_at = NULL,
         attempt_count = MAX(0, attempt_count - 1)
   WHERE id = ? AND state = 'claimed'
`;

/**
 * Auto-retry transition: returns a `claimed`/`inflight` row to `queued` with a
 * future `next_attempt_at` so {@link CLAIM_NEXT}'s backoff predicate won't
 * re-hand it out until the delay elapses. Because the row keeps its id and
 * claims are ordered by id, it stays at the head of its channel's FIFO and
 * blocks younger rows until it succeeds or exhausts its attempts — preserving
 * per-channel ordering across retries. `processing_started_at`/`sent_at` are
 * cleared so the row reads as a clean re-queued entry; the next claim re-stamps
 * them. Unlike {@link REQUEUE} (a provably-unsent `claimed` row), this keeps
 * `attempt_count` — the failed dispatch counted as a real attempt.
 *
 * `server_status_code`/`server_response_body` are cleared too: they belong to
 * the attempt that just failed, and a `queued` row awaiting its next attempt is
 * NOT settled — replaying that stale response to a retransmitting source (see
 * `handleDuplicate` in hl7.ts) would tell them a verdict the agent itself hasn't
 * accepted yet.
 *
 * `state IN ('claimed', 'inflight', 'queued')` — 'queued' is included for the
 * late-response settle path (`onServerResponse` in worker.ts), which can decide
 * to reschedule a row that already returned to `queued` after its response
 * timeout fired locally (the server's answer arrives after the fact). The
 * `attempt_count = ?` guard is what makes this safe: it only applies when the
 * row is still on the exact attempt this decision was made for. A response for
 * an attempt the row has since moved past (a newer claim already bumped
 * `attempt_count`) — or one settled elsewhere entirely, e.g. by a peer that took
 * the dispatch lease — leaves the row untouched (0 rows changed) rather than
 * corrupting a newer attempt's in-progress state with a stale decision.
 */
export const SCHEDULE_RETRY = `
  UPDATE inbound_hl7_messages
     SET state = 'queued',
         processing_started_at = NULL,
         sent_at = NULL,
         server_status_code = NULL,
         server_response_body = NULL,
         last_error = ?,
         error_code = ?,
         next_attempt_at = ?
   WHERE id = ? AND attempt_count = ? AND state IN ('claimed', 'inflight', 'queued')
`;

// --- Startup / recovery ---

/** Repopulate the in-memory wake signal. Served by `idx_inbound_channel_state_id`. [index-guarded] */
export const LIST_QUEUED_IDS_FOR_CHANNEL = `
  SELECT id FROM inbound_hl7_messages
   WHERE channel_name = ? AND state = 'queued'
   ORDER BY id ASC
`;

/**
 * Crash recovery, ambiguous leg (normal mode): a row left `inflight` (the request
 * went out but no response came back before the restart) may or may not have
 * reached the Bot, so a non-guaranteed channel lands it in `failed` for operator
 * review — never silently retried, because re-dispatch could double-process.
 * Guaranteed-delivery rows are handled by {@link RECOVER_INFLIGHT_GUARANTEED}
 * instead (they accepted the duplication risk). The `WHERE state` scan (no channel
 * filter) is served by `idx_inbound_state_processed_at`. [index-guarded]
 */
export const RECOVER_INFLIGHT = `
  UPDATE inbound_hl7_messages
     SET state = 'failed',
         errored_at = ?,
         last_error = COALESCE(last_error, 'interrupted: process restart while inflight'),
         error_code = COALESCE(error_code, '${QueueErrorCode.Interrupted}')
   WHERE state = 'inflight' AND guaranteed_delivery = 0
`;

/**
 * Crash recovery, ambiguous leg (guaranteed-delivery mode): a row left `inflight`
 * whose channel opted into guaranteed delivery is returned to `queued`
 * (duplication risk accepted) instead of parking in `failed`, so the channel
 * keeps trying until upstream gives a definitive answer (§4.1). `sent_at` and
 * `next_attempt_at` are cleared so it reads as a clean re-queued entry,
 * immediately claimable on restart. The `WHERE state` scan is served by
 * `idx_inbound_state_processed_at`. [index-guarded]
 */
export const RECOVER_INFLIGHT_GUARANTEED = `
  UPDATE inbound_hl7_messages
     SET state = 'queued',
         processing_started_at = NULL,
         sent_at = NULL,
         next_attempt_at = NULL,
         last_error = 'interrupted: process restart while inflight',
         error_code = '${QueueErrorCode.Interrupted}'
   WHERE state = 'inflight' AND guaranteed_delivery = 1
`;

/**
 * Crash recovery, safe leg: a row left `claimed` (a worker owned it but the
 * request never reached the socket — `sent_at` is still NULL) provably never hit
 * the server, so it's returned to `queued` to re-dispatch with no duplicate
 * risk. The attempt_count decrement undoes the claim's increment, since the
 * claim never resulted in a real delivery attempt. The `WHERE state` scan is
 * served by `idx_inbound_state_processed_at`. [index-guarded]
 */
export const RECOVER_CLAIMED = `
  UPDATE inbound_hl7_messages
     SET state = 'queued',
         processing_started_at = NULL,
         attempt_count = MAX(0, attempt_count - 1)
   WHERE state = 'claimed'
`;

// --- Stats / diagnostics ---

/** Counts of rows by state (full GROUP BY scan — diagnostic, not on the hot path). */
export const COUNT_BY_STATE = `
  SELECT state, COUNT(*) AS n FROM inbound_hl7_messages GROUP BY state
`;

/** Per-channel queue depth snapshot (queued/claimed/inflight counts + oldest queued time). */
export const CHANNEL_DEPTH = `
  SELECT
    SUM(state = 'queued')                                            AS queued,
    SUM(state = 'claimed')                                           AS claimed,
    SUM(state = 'inflight')                                          AS inflight,
    MIN(CASE WHEN state = 'queued' THEN received_at ELSE NULL END)   AS oldest_queued_at
  FROM inbound_hl7_messages
  WHERE channel_name = ?
`;

/** Size of the DB file in bytes, from `page_count * page_size`. Used by the retention sweeper. */
export const DB_SIZE_BYTES = `
  SELECT page_count * page_size AS bytes FROM pragma_page_count, pragma_page_size
`;

// --- Dispatch lease coordination (single-row PK table `_lease`) ---

/**
 * Lease acquire — upsert that succeeds only if no current lease, or if the
 * current lease is held by us, or if it has expired. The WHERE clause on the
 * ON CONFLICT branch is the gate: a foreign holder with a still-valid lease
 * makes the UPDATE a no-op, and `changes()` returning 0 tells the caller they
 * didn't get it. Bound parameters (in order): holder, now, expires_at, holder, now.
 */
export const TRY_ACQUIRE_LEASE = `
  INSERT INTO _lease (id, holder, acquired_at, expires_at)
  VALUES (1, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE
     SET holder = excluded.holder,
         acquired_at = excluded.acquired_at,
         expires_at = excluded.expires_at
   WHERE _lease.holder = ? OR _lease.expires_at <= ?
`;

/**
 * Heartbeat — extends our own lease. Fails (returns 0 changes) if the lease is
 * now held by someone else, which is how a stale leader learns it lost.
 */
export const HEARTBEAT_LEASE = `
  UPDATE _lease SET expires_at = ? WHERE id = 1 AND holder = ?
`;

/** Release the lease iff `holder` still owns it. */
export const RELEASE_LEASE = `
  DELETE FROM _lease WHERE id = 1 AND holder = ?
`;

/** Read the current lease row (diagnostics + the demotion gate). */
export const GET_LEASE = `
  SELECT holder, expires_at FROM _lease WHERE id = 1
`;

// --- Maintenance ---

/** Fold the WAL into the main DB file and truncate the WAL to zero bytes. */
export const CHECKPOINT_WAL = `PRAGMA wal_checkpoint(TRUNCATE)`;

// --- Retention sweep (cold, periodic / under size pressure) ---

/** Phase 1 — time-based purge of fully-done processed rows. `idx_inbound_state_processed_at`. [index-guarded] */
export const RETENTION_PHASE1_DELETE = `
  DELETE FROM inbound_hl7_messages
   WHERE state = 'processed' AND ack_outcome != 'undelivered' AND processed_at < ?
`;

/** Phase 2 — size-driven purge of oldest fully-done processed rows. `idx_inbound_state_processed_at`. [index-guarded] */
export const RETENTION_PHASE2_DELETE = `
  DELETE FROM inbound_hl7_messages
   WHERE id IN (
     SELECT id FROM inbound_hl7_messages
      WHERE state = 'processed' AND ack_outcome != 'undelivered'
      ORDER BY processed_at ASC
      LIMIT ?
   )
`;

/** Phase 3 — floor-protected purge of terminal/undelivered rows. `idx_inbound_state_processed_at`. [index-guarded] */
export const RETENTION_PHASE3_DELETE = `
  DELETE FROM inbound_hl7_messages
   WHERE id IN (
     SELECT id FROM inbound_hl7_messages
      WHERE (
              state IN ('rejected', 'failed', 'nacked')
              OR (state = 'processed' AND ack_outcome = 'undelivered')
            )
        AND COALESCE(errored_at, processed_at) < ?
      ORDER BY COALESCE(errored_at, processed_at) ASC
      LIMIT ?
   )
`;
