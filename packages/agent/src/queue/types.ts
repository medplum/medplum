// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Lifecycle states for a row in `inbound_hl7_messages`.
 *
 * See DURABLE_QUEUE_PLAN.md §4 for the full transition diagram.
 *
 * - `queued`     — inserted, awaiting worker dispatch.
 * - `processing` — worker has claimed it and dispatched to the Medplum server.
 * - `processed`  — server returned 2xx and the app-level ACK was delivered to the source.
 * - `errored`    — terminal failure post-commit (server 4xx/5xx, ACK delivery failure,
 *                  or "interrupted" — a row found in `processing` on startup).
 * - `nacked`     — rejected at intake; sender was told NACK and the row exists only for audit.
 */
export const MessageState = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  ERRORED: 'errored',
  NACKED: 'nacked',
} as const;
export type MessageState = (typeof MessageState)[keyof typeof MessageState];

/** Per-channel intake policy for duplicate MSH.10 collisions. See §7 of the plan. */
export const DuplicateBehavior = {
  REJECT: 'reject',
  IDEMPOTENT: 'idempotent',
} as const;
export type DuplicateBehavior = (typeof DuplicateBehavior)[keyof typeof DuplicateBehavior];

/** Wire format for the `enhanced_mode` column — mirrors `@medplum/hl7`'s EnhancedMode. */
export type EnhancedModeColumn = 'standard' | 'aaMode' | null;

/**
 * A row in `inbound_hl7_messages`, decoded into typed JavaScript values.
 *
 * Columns that are `NULL` in SQL surface as `null` here (not `undefined`), so callers
 * can distinguish "not yet set" from "absent property."
 */
export interface InboundRow {
  id: number;
  channelName: string;
  remote: string;
  msgControlId: string | null;
  msgType: string | null;
  body: Buffer;
  encoding: string | null;
  enhancedMode: EnhancedModeColumn;
  state: MessageState;
  attemptCount: number;
  callbackId: string;
  serverResponseBody: Buffer | null;
  serverStatusCode: number | null;
  ackSentToSource: boolean;
  lastError: string | null;
  seqNo: number | null;
  receivedAt: number;
  committedAt: number | null;
  processingStartedAt: number | null;
  processedAt: number | null;
  erroredAt: number | null;
}

/** Input payload for {@link DurableQueue.enqueue}. */
export interface EnqueueInput {
  channelName: string;
  remote: string;
  msgControlId: string | null;
  msgType: string | null;
  body: Buffer;
  encoding: string | null;
  enhancedMode: EnhancedModeColumn;
  callbackId: string;
  seqNo: number | null;
  receivedAt: number;
}

/** Input payload for {@link DurableQueue.enqueueRejected}. */
export interface EnqueueRejectedInput extends EnqueueInput {
  lastError: string;
}

/**
 * Distinguishes the outcomes of an idempotent intake attempt against an active
 * duplicate (one still in `queued` or `processing`).
 */
export type EnqueueResult =
  | { kind: 'inserted'; row: InboundRow }
  | { kind: 'duplicateActive'; existing: InboundRow };
