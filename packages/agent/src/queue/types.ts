// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Lifecycle state for a row in `inbound_hl7_messages`.
 *
 * `state` tracks the **Bot leg** — the message's journey to the Medplum server
 * and back — and the worker scheduling lifecycle. The independent **source leg**
 * (delivering the app-level ACK back to the sending device) is tracked
 * separately in {@link AckOutcome}, so the two can't be conflated: a message the
 * Bot accepted but whose ACK we couldn't return is `processed` + `undelivered`,
 * NOT a Bot-leg failure. See DURABLE_QUEUE_ARCHITECTURE.md §4 for the transition diagram.
 *
 * - `queued`     — inserted, awaiting worker dispatch.
 * - `processing` — worker has claimed it and dispatched to the Medplum server.
 * - `processed`  — the Bot accepted it (server 2xx). Says nothing about whether
 *                  the source ACK was delivered — see {@link AckOutcome}.
 * - `rejected`   — terminal: the Bot rejected the message itself (permanent 4xx).
 *                  Retrying can never help; the content must be triaged.
 * - `failed`     — terminal-for-now: a transient/ambiguous Bot-leg failure
 *                  (5xx, 429, response timeout, dispatch error, or "interrupted" —
 *                  a row found in `processing` on startup). The retry/operator-
 *                  review candidate; never confused with a `rejected` message.
 * - `nacked`     — rejected at intake; sender was told NACK and the row exists only for audit.
 */
export const MessageState = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  REJECTED: 'rejected',
  FAILED: 'failed',
  NACKED: 'nacked',
} as const;
export type MessageState = (typeof MessageState)[keyof typeof MessageState];

/**
 * Outcome of the **source leg** — delivering the app-level ACK back to the
 * sending device — tracked independently of the Bot-leg {@link MessageState}.
 *
 * This is the axis that lets "the Bot processed it but we couldn't ACK the
 * source" (`processed` + `undelivered`) be a first-class, queryable state rather
 * than masquerading as an upstream failure. Crucially, an `undelivered` ACK is
 * never a reason to re-dispatch to the Bot (that already succeeded) — recovery
 * is the source retransmitting, which replays the stored ACK (see §8).
 *
 * - `pending`     — owed but not yet resolved (the default while queued/processing,
 *                   and on interrupted rows whose ack leg never resolved).
 * - `delivered`   — the source received the app-level ACK (includes policy-suppressed
 *                   sends, which are a successful no-op). Also set when a retransmit
 *                   later replays a previously-undelivered ACK.
 * - `undelivered` — the Bot accepted the message but the ACK couldn't reach the
 *                   source (connection closed). The actionable signal.
 * - `not_owed`    — no app-level ACK will be delivered for this row: intake-`nacked`,
 *                   or the Bot leg ended `rejected`/`failed` with no success to relay.
 */
export const AckOutcome = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  UNDELIVERED: 'undelivered',
  NOT_OWED: 'not_owed',
} as const;
export type AckOutcome = (typeof AckOutcome)[keyof typeof AckOutcome];

/**
 * Machine-readable classification attached to every post-commit failure.
 *
 * Codes are assigned at the failure site (the worker knows which path failed)
 * and stored in the `error_code` column alongside the human-readable
 * `last_error`, so operators and tooling can reason about *why* a row errored
 * without parsing free-form error strings.
 *
 * Most codes here describe a **Bot-leg** failure (they annotate a `rejected` or
 * `failed` row). The source-leg ACK-delivery outcome is NOT an error code — it
 * lives on its own axis ({@link AckOutcome}), precisely so a failed ACK can
 * never be misread as a re-dispatchable upstream failure. The trailing
 * **intake-rejection** codes are the exception: they annotate `nacked` audit
 * rows (a message intake refused before it was ever committed), so tooling can
 * tell a storage-error reject from a duplicate-collision reject without parsing
 * `last_error`. A retry policy must never act on a `nacked` row — it was never
 * accepted — so these codes are outside the transient/ambiguous/permanent split.
 *
 * The Bot-leg codes are grouped into three failure classes — the distinction a
 * retry policy keys off of:
 * - Transient: the failure says nothing about the message itself, so a later
 *   attempt could succeed. (Row state: `failed`.)
 * - Ambiguous: the request may have reached the server, so re-dispatching would
 *   risk duplicate processing. Operator review required. (Row state: `failed`.)
 * - Permanent: retrying can never help. (Row state: `rejected`.)
 *
 * NOTE for the (not-yet-built) Path-2 retry layer: `failed` is NOT uniformly
 * retryable — it covers both transient and ambiguous codes. A retry policy must
 * gate on the *code*, not the `failed` state alone: auto-retry only the transient
 * codes (`ServerError`, `ServerRateLimited`); the ambiguous codes (`ResponseTimeout`,
 * `Interrupted`, `WorkerStopped`, `DispatchFailed`) must stay operator-review-only
 * until server-side callback-keyed dedupe makes redispatch idempotent (see
 * DURABLE_QUEUE_ARCHITECTURE.md §4 + §16).
 */
export const QueueErrorCode = {
  /** Transient (`failed`): server returned 5xx. */
  ServerError: 'server-error',
  /** Transient (`failed`): server returned 429. */
  ServerRateLimited: 'server-rate-limited',
  /** Ambiguous (`failed`): timed out waiting for the server response; delivery unknown. */
  ResponseTimeout: 'response-timeout',
  /** Ambiguous (`failed`): row was in `processing` when the agent restarted. */
  Interrupted: 'interrupted',
  /** Ambiguous (`failed`): in-flight dispatch was cancelled by worker shutdown. */
  WorkerStopped: 'worker-stopped',
  /** Ambiguous (`failed`): dispatch failed for an unclassified reason; delivery unknown. */
  DispatchFailed: 'dispatch-failed',
  /** Permanent (`rejected`): server returned 4xx (other than 429) — the message was rejected. */
  ServerRejected: 'server-rejected',
  /** Intake rejection (`nacked`): a storage error prevented the message from being committed. */
  StorageError: 'storage-error',
  /** Intake rejection (`nacked`): the message reused a committed control ID (duplicate collision). */
  DuplicateRejected: 'duplicate-rejected',
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
  /** Source-leg delivery outcome — independent of {@link state}. See {@link AckOutcome}. */
  ackOutcome: AckOutcome;
  lastError: string | null;
  errorCode: QueueErrorCode | null;
  seqNo: number | null;
  receivedAt: number;
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
  /** Machine-readable reason this intake was rejected, stored in `error_code`. */
  errorCode: QueueErrorCode;
}

/**
 * Outcome of an intake attempt. `duplicate` means a prior row for the same
 * `(channel, msg_control_id)` already exists in a non-`nacked` state (queued,
 * processing, processed, or errored) — the caller compares bodies to decide
 * between replaying the prior ACK and rejecting the collision (§8).
 */
export type EnqueueResult = { kind: 'inserted'; row: InboundRow } | { kind: 'duplicate'; existing: InboundRow };
