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
 * Codes are attached at the failure site (the worker knows which path failed),
 * stored in the `error_code` column, and checked against
 * {@link RETRYABLE_ERROR_CODES} when auto-retry is enabled — never derived by
 * parsing `last_error` strings.
 *
 * Classes:
 * - Transient (retryable): the failure says nothing about the message itself,
 *   so a later attempt can succeed.
 * - Ambiguous (not retryable): the request may have reached the server, so
 *   re-dispatching risks duplicate processing. Operator review required.
 * - Permanent (not retryable): retrying can never help, or would actively
 *   cause duplicate server-side processing.
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
  /** Permanent: upstream answered with a definitive HL7 reject (MSA-1 of AR or CR). */
  UpstreamRejected: 'upstream-rejected',
  /** Upstream answered with an HL7 application/commit error (MSA-1 of AE or CE) — retried only in guaranteed-delivery mode. */
  UpstreamError: 'upstream-error',
} as const;
export type QueueErrorCode = (typeof QueueErrorCode)[keyof typeof QueueErrorCode];

/**
 * The set of {@link QueueErrorCode} values eligible for auto-retry. Membership
 * here means "a later attempt can succeed and cannot duplicate work" —
 * ambiguous-delivery codes stay out until the server supports callback-keyed
 * dedupe.
 */
export const RETRYABLE_ERROR_CODES: ReadonlySet<QueueErrorCode> = new Set<QueueErrorCode>([
  QueueErrorCode.ServerError,
  QueueErrorCode.ServerRateLimited,
]);

/**
 * Codes that stop retries even in guaranteed-delivery mode, which otherwise
 * retries every failure (duplication risk accepted). Both represent a
 * definitive upstream answer for the message:
 * - `AckDeliveryFailed`: upstream accepted it (AA/CA, 2xx) — only the ACK back
 *   to the source failed; re-dispatching would duplicate.
 * - `UpstreamRejected`: upstream definitively rejected it (AR/CR).
 */
export const GUARANTEED_TERMINAL_CODES: ReadonlySet<QueueErrorCode> = new Set<QueueErrorCode>([
  QueueErrorCode.AckDeliveryFailed,
  QueueErrorCode.UpstreamRejected,
]);

/** An Error carrying its {@link QueueErrorCode} from the failure site to the retry decision. */
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
  body: Buffer;
  encoding: string | null;
  enhancedMode: EnhancedModeColumn;
  state: MessageState;
  attemptCount: number;
  guaranteedDelivery: boolean;
  callbackId: string;
  serverResponseBody: Buffer | null;
  serverStatusCode: number | null;
  ackSentToSource: boolean;
  lastError: string | null;
  errorCode: QueueErrorCode | null;
  nextAttemptAt: number | null;
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
  /**
   * Snapshot of the channel's guaranteed-delivery setting at intake time.
   * Stored on the row so `recoverOnStartup` (which runs before channel
   * policies are resolved) knows whether to requeue or error an interrupted
   * row. Defaults to false.
   */
  guaranteedDelivery?: boolean;
}

/** Input payload for {@link DurableQueue.enqueueRejected}. */
export interface EnqueueRejectedInput extends EnqueueInput {
  lastError: string;
}

/**
 * Distinguishes the outcomes of an idempotent intake attempt against an active
 * duplicate (one still in `queued` or `processing`).
 */
export type EnqueueResult = { kind: 'inserted'; row: InboundRow } | { kind: 'duplicateActive'; existing: InboundRow };
