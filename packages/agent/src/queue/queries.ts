// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { QueueErrorCode } from './types';

/**
 * SQL for the queries whose performance depends on a specific index.
 *
 * These are kept here, as named constants, so that the implementation (the
 * prepared statements in {@link DurableQueue} and {@link RetentionSweeper}) and
 * the `EXPLAIN QUERY PLAN` regression guards in `query-plan.test.ts` reference
 * the *exact same* SQL text. If a query changes shape, the plan test re-checks
 * its index against the change automatically — the two can never silently drift.
 *
 * Statements that only ever resolve a row by its INTEGER PRIMARY KEY (findById,
 * markProcessed, requeue, …) or hit a single-row/PK table (`_lease`,
 * `_channel_seq`) are intentionally NOT here — they need no index beyond the
 * rowid and there is nothing to guard.
 */

// --- Hot path (per inbound message / per worker tick) ---

/**
 * Intake dedup: most recent prior row for a (channel, control_id) in any
 * non-`nacked` state. Served by `idx_inbound_dup_lookup`.
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
 * served by `idx_inbound_channel_state_id`.
 */
export const CLAIM_NEXT = `
  UPDATE inbound_hl7_messages
     SET state = 'claimed',
         processing_started_at = ?,
         attempt_count = attempt_count + 1
   WHERE id = (
     SELECT id FROM inbound_hl7_messages
      WHERE channel_name = ? AND state = 'queued'
      ORDER BY id ASC
      LIMIT 1
   )
   RETURNING *
`;

/**
 * Phase A → B: the transmit request was written to the socket, so flip the
 * `claimed` row to `inflight` and stamp `sent_at`. Keyed by callback id (served
 * by `uq_inbound_callback`). The `state = 'claimed'` guard makes it a no-op for
 * legacy (non-durable) sends and for any row already past `claimed`.
 */
export const MARK_SENT = `
  UPDATE inbound_hl7_messages
     SET state = 'inflight',
         sent_at = ?
   WHERE callback_id = ? AND state = 'claimed'
`;

/** Late server-response lookup by callback id. Served by `uq_inbound_callback`. */
export const FIND_BY_CALLBACK = `
  SELECT * FROM inbound_hl7_messages WHERE callback_id = ?
`;

// --- Startup / recovery ---

/** Repopulate the in-memory wake signal. Served by `idx_inbound_channel_state_id`. */
export const LIST_QUEUED_IDS_FOR_CHANNEL = `
  SELECT id FROM inbound_hl7_messages
   WHERE channel_name = ? AND state = 'queued'
   ORDER BY id ASC
`;

/**
 * Crash recovery, ambiguous leg: a row left `inflight` (the request went out
 * but no response came back before the restart) may or may not have reached the
 * Bot, so it lands in `failed` for operator review — never silently retried. The
 * `WHERE state` scan (no channel filter) is served by `idx_inbound_state_processed_at`.
 */
export const RECOVER_INFLIGHT = `
  UPDATE inbound_hl7_messages
     SET state = 'failed',
         errored_at = ?,
         last_error = COALESCE(last_error, 'interrupted: process restart while inflight'),
         error_code = COALESCE(error_code, '${QueueErrorCode.Interrupted}')
   WHERE state = 'inflight'
`;

/**
 * Crash recovery, safe leg: a row left `claimed` (a worker owned it but the
 * request never reached the socket — `sent_at` is still NULL) provably never hit
 * the server, so it's returned to `queued` to re-dispatch with no duplicate
 * risk. The attempt_count decrement undoes the claim's increment, since the
 * claim never resulted in a real delivery attempt. The `WHERE state` scan is
 * served by `idx_inbound_state_processed_at`.
 */
export const RECOVER_CLAIMED = `
  UPDATE inbound_hl7_messages
     SET state = 'queued',
         processing_started_at = NULL,
         attempt_count = MAX(0, attempt_count - 1)
   WHERE state = 'claimed'
`;

// --- Retention sweep (cold, periodic / under size pressure) ---

/** Phase 1 — time-based purge of fully-done processed rows. `idx_inbound_state_processed_at`. */
export const RETENTION_PHASE1_DELETE = `
  DELETE FROM inbound_hl7_messages
   WHERE state = 'processed' AND ack_outcome != 'undelivered' AND processed_at < ?
`;

/** Phase 2 — size-driven purge of oldest fully-done processed rows. `idx_inbound_state_processed_at`. */
export const RETENTION_PHASE2_DELETE = `
  DELETE FROM inbound_hl7_messages
   WHERE id IN (
     SELECT id FROM inbound_hl7_messages
      WHERE state = 'processed' AND ack_outcome != 'undelivered'
      ORDER BY processed_at ASC
      LIMIT ?
   )
`;

/** Phase 3 — floor-protected purge of terminal/undelivered rows. `idx_inbound_state_processed_at`. */
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
