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
 * FIFO claim: flip the lowest-id queued row for a channel to `processing` in one
 * statement. The inner SELECT is served by `idx_inbound_channel_state_id`.
 *
 * The `next_attempt_at` backoff predicate sits on the OUTER update, not the
 * inner select, on purpose: a head row still waiting out its retry backoff
 * blocks the whole channel (claim returns null) instead of letting younger rows
 * skip ahead. That head-of-line blocking preserves the per-channel FIFO
 * ordering guarantee across retries. The claim also clears `next_attempt_at` so
 * a re-claimed retry row carries no stale schedule.
 */
export const CLAIM_NEXT = `
  UPDATE inbound_hl7_messages
     SET state = 'processing',
         processing_started_at = ?,
         attempt_count = attempt_count + 1,
         next_attempt_at = NULL
   WHERE id = (
     SELECT id FROM inbound_hl7_messages
      WHERE channel_name = ? AND state = 'queued'
      ORDER BY id ASC
      LIMIT 1
   )
   AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
   RETURNING *
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
 * Crash recovery (non-guaranteed channels): mark rows left mid-flight
 * (`processing`) as `failed` for operator review — `interrupted` is ambiguous,
 * so it is never silently auto-retried. The `WHERE state` scan (no channel
 * filter) is served by `idx_inbound_state_processed_at`.
 */
export const RECOVER_PROCESSING = `
  UPDATE inbound_hl7_messages
     SET state = 'failed',
         errored_at = ?,
         last_error = COALESCE(last_error, 'interrupted: process restart while processing'),
         error_code = COALESCE(error_code, '${QueueErrorCode.Interrupted}')
   WHERE state = 'processing' AND guaranteed_delivery = 0
`;

/**
 * Crash recovery (guaranteed-delivery channels): the operator asked us to keep
 * trying until upstream gives a definitive answer, so an interrupted row goes
 * straight back to the head of its channel's FIFO (duplication risk accepted)
 * instead of parking in `failed`. `next_attempt_at` is cleared so it is
 * immediately claimable on restart. Served by `idx_inbound_state_processed_at`.
 */
export const RECOVER_PROCESSING_GUARANTEED = `
  UPDATE inbound_hl7_messages
     SET state = 'queued',
         processing_started_at = NULL,
         next_attempt_at = NULL,
         last_error = 'interrupted: process restart while processing',
         error_code = '${QueueErrorCode.Interrupted}'
   WHERE state = 'processing' AND guaranteed_delivery = 1
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

/** Phase 3 — floor-protected purge of terminal/undelivered rows. `idx_inbound_terminal_at`. */
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
