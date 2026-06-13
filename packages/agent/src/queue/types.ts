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

/**
 * Machine-readable classification attached to every post-commit failure.
 *
 * Codes are assigned at the failure site (the worker knows which path failed)
 * and stored in the `error_code` column alongside the human-readable
 * `last_error`, so operators and tooling can reason about *why* a row errored
 * without parsing free-form error strings.
 *
 * The codes are grouped into three failure classes — the distinction a retry
 * policy keys off of:
 * - Transient: the failure says nothing about the message itself, so a later
 *   attempt could succeed.
 * - Ambiguous: the request may have reached the server, so re-dispatching would
 *   risk duplicate processing. Operator review required.
 * - Permanent: retrying can never help, or would actively cause duplicate
 *   server-side processing.
 */
export const QueueErrorCode = {
  /** Transient: server returned 5xx. */
  ServerError: 'server-error',
  /** Transient: server returned 429. */
  ServerRateLimited: 'server-rate-limited',
  /** Ambiguous: timed out waiting for the server response; delivery unknown. */
  ResponseTimeout: 'response-timeout',
  /** Ambiguous: row was in `processing` when the agent restarted. */
  Interrupted: 'interrupted',
  /** Ambiguous: in-flight dispatch was cancelled by worker shutdown. */
  WorkerStopped: 'worker-stopped',
  /** Ambiguous: dispatch failed for an unclassified reason; delivery unknown. */
  DispatchFailed: 'dispatch-failed',
  /** Permanent: server returned 4xx (other than 429) — the message was rejected. */
  ServerRejected: 'server-rejected',
  /** Permanent: server processed the message (2xx) but the ACK could not be delivered to the source. */
  AckDeliveryFailed: 'ack-delivery-failed',
} as const;
export type QueueErrorCode = (typeof QueueErrorCode)[keyof typeof QueueErrorCode];

/** An Error carrying its {@link QueueErrorCode} from the failure site to the point that records it. */
export class QueueError extends Error {
  readonly code: QueueErrorCode;

  constructor(code: QueueErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

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
  /** The message exactly as received; used for the duplicate-content comparison. */
  originalMessage: Buffer;
  /** The message as dispatched upstream (e.g. with an assigned MSH.13); equals {@link originalMessage} when untransformed. */
  finalizedMessage: Buffer;
  encoding: string | null;
  enhancedMode: EnhancedModeColumn;
  state: MessageState;
  attemptCount: number;
  callbackId: string;
  serverResponseBody: Buffer | null;
  serverStatusCode: number | null;
  ackSentToSource: boolean;
  lastError: string | null;
  errorCode: QueueErrorCode | null;
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
  /** The message exactly as received; persisted for the duplicate-content comparison. */
  originalMessage: Buffer;
  /** The message to dispatch upstream; equals {@link originalMessage} when the channel applies no transformation. */
  finalizedMessage: Buffer;
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
 * Outcome of an intake attempt. `duplicate` means a prior row for the same
 * `(channel, msg_control_id)` already exists in a non-`nacked` state (queued,
 * processing, processed, or errored) — the caller compares bodies to decide
 * between replaying the prior ACK and rejecting the collision (§8).
 */
export type EnqueueResult = { kind: 'inserted'; row: InboundRow } | { kind: 'duplicate'; existing: InboundRow };
