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
 * NOT a Bot-leg failure. See DURABLE_QUEUE_PLAN.md §4 for the transition diagram.
 *
 * - `queued`     — inserted, awaiting worker dispatch.
 * - `processing` — worker has claimed it and dispatched to the Medplum server.
 * - `processed`  — the Bot accepted it (server 2xx). Says nothing about whether
 *                  the source ACK was delivered — see {@link AckOutcome}.
 * - `rejected`   — terminal: the Bot rejected the message itself (permanent 4xx,
 *                  or a definitive upstream HL7 reject in guaranteed-delivery
 *                  mode). Retrying can never help; the content must be triaged.
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
 * `last_error`, so the retry policy and operator tooling can reason about *why*
 * a row errored without parsing free-form error strings.
 *
 * Every code here describes a **Bot-leg** failure (it annotates a `rejected` or
 * `failed` row). The source-leg ACK-delivery outcome is NOT an error code — it
 * lives on its own axis ({@link AckOutcome}), precisely so a failed ACK can
 * never be misread as a re-dispatchable upstream failure.
 *
 * The codes are grouped into three failure classes — the distinction the retry
 * policy keys off of (see {@link RETRYABLE_ERROR_CODES} and the §4 retry rules):
 *
 * - **Transient** — the failure says nothing about the message itself, so a
 *   later attempt could succeed. Safe to auto-retry: re-dispatch cannot
 *   duplicate work, because the server provably never accepted the message.
 *   Row state: `failed`.
 * - **Ambiguous** — the request may have reached the server, so re-dispatching
 *   would risk duplicate processing. The row lands in `failed` for operator
 *   review but is NOT auto-retried in normal mode. (See the §4 note below.)
 * - **Permanent** — retrying can never help; the message itself was rejected.
 *   Row state: `rejected`.
 *
 * Retry-gating rule (§4) — the whole point of the transient/ambiguous split:
 * the `failed` state is NOT uniformly retryable. It covers BOTH transient and
 * ambiguous codes, so a retry policy must gate on the *code*, never the `failed`
 * state alone. In normal (default) mode only the transient codes
 * ({@link RETRYABLE_ERROR_CODES}: `ServerError`, `ServerRateLimited`) auto-retry;
 * the ambiguous codes (`ResponseTimeout`, `Interrupted`, `WorkerStopped`,
 * `DispatchFailed`) stay operator-review-only, because the server may have
 * already processed the message and a blind re-dispatch would double-process.
 * They only become safe to auto-retry once server-side callback-keyed dedupe
 * makes redispatch idempotent. The explicit `guaranteedDelivery` opt-in
 * overrides this and retries the ambiguous codes too (duplication risk
 * accepted), stopping only on a definitive upstream answer — see
 * {@link GUARANTEED_TERMINAL_CODES}.
 */
export const QueueErrorCode = {
  /** Transient (`failed`): server returned 5xx. Auto-retryable. */
  ServerError: 'server-error',
  /** Transient (`failed`): server returned 429. Auto-retryable. */
  ServerRateLimited: 'server-rate-limited',
  /** Ambiguous (`failed`): timed out waiting for the server response; delivery unknown. Review-only in normal mode. */
  ResponseTimeout: 'response-timeout',
  /** Ambiguous (`failed`): row was in `processing` when the agent restarted. Review-only in normal mode. */
  Interrupted: 'interrupted',
  /** Ambiguous (`failed`): in-flight dispatch was cancelled by worker shutdown. Review-only in normal mode. */
  WorkerStopped: 'worker-stopped',
  /** Ambiguous (`failed`): dispatch failed for an unclassified reason; delivery unknown. Review-only in normal mode. */
  DispatchFailed: 'dispatch-failed',
  /** Permanent (`rejected`): server returned 4xx (other than 429) — the message was rejected. */
  ServerRejected: 'server-rejected',
  /** Permanent (`rejected`): upstream answered with a definitive HL7 reject (MSA-1 of AR or CR). Guaranteed mode only. */
  UpstreamRejected: 'upstream-rejected',
  /**
   * Upstream answered with an HL7 application/commit error (MSA-1 of AE or CE).
   * Lands in `failed`; retried only in guaranteed-delivery mode (it is NOT a
   * definitive answer, so guaranteed mode keeps trying). Only ever produced on
   * the guaranteed-delivery path, which parses MSA-1 from the server response.
   */
  UpstreamError: 'upstream-error',
} as const;
export type QueueErrorCode = (typeof QueueErrorCode)[keyof typeof QueueErrorCode];

/**
 * The transient codes — the ONLY ones eligible for auto-retry in normal
 * (default) mode. Membership means "a later attempt can succeed and cannot
 * duplicate work" because the server provably never accepted the message.
 *
 * Deliberately excludes the ambiguous codes (`ResponseTimeout`, `Interrupted`,
 * `WorkerStopped`, `DispatchFailed`): those also live in the `failed` state, but
 * the server might already have processed the message, so a blind re-dispatch
 * could double-process. They stay out of auto-retry until the server supports
 * callback-keyed dedupe. The retry policy gates on this set, never on the
 * `failed` state alone — see {@link QueueErrorCode}.
 */
export const RETRYABLE_ERROR_CODES: ReadonlySet<QueueErrorCode> = new Set<QueueErrorCode>([
  QueueErrorCode.ServerError,
  QueueErrorCode.ServerRateLimited,
]);

/**
 * The permanent codes — failures that map to the `rejected` state because
 * retrying can never help: the message itself was rejected (a 4xx from the
 * server, or a definitive upstream HL7 reject). Every other code maps to
 * `failed`. Used by the worker to choose the terminal state when a failure is
 * not (or no longer) being retried.
 */
export const PERMANENT_ERROR_CODES: ReadonlySet<QueueErrorCode> = new Set<QueueErrorCode>([
  QueueErrorCode.ServerRejected,
  QueueErrorCode.UpstreamRejected,
]);

/**
 * Codes that stop retries even in guaranteed-delivery mode, which otherwise
 * retries every failure — transient AND ambiguous — until upstream gives a
 * definitive answer (duplication risk accepted).
 *
 * Only `UpstreamRejected` (MSA-1 of AR/CR) qualifies: it is the one outcome that
 * says "this exact message will be rejected on every retransmit," so continuing
 * to retry is pointless. (The old `AckDeliveryFailed` terminal is gone: a Bot
 * accept whose source ACK failed is now `processed` + `undelivered` and never
 * reaches the retry path at all — see {@link AckOutcome}.)
 */
export const GUARANTEED_TERMINAL_CODES: ReadonlySet<QueueErrorCode> = new Set<QueueErrorCode>([
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
  /** The message exactly as received; used for the duplicate-content comparison. */
  originalMessage: Buffer;
  /** The message as dispatched upstream (e.g. with an assigned MSH.13); equals {@link originalMessage} when untransformed. */
  finalizedMessage: Buffer;
  encoding: string | null;
  enhancedMode: EnhancedModeColumn;
  state: MessageState;
  attemptCount: number;
  guaranteedDelivery: boolean;
  callbackId: string;
  serverResponseBody: Buffer | null;
  serverStatusCode: number | null;
  /** Source-leg delivery outcome — independent of {@link state}. See {@link AckOutcome}. */
  ackOutcome: AckOutcome;
  lastError: string | null;
  errorCode: QueueErrorCode | null;
  /** Earliest time (ms) a retry-scheduled `queued` row may be re-claimed; null unless a retry is pending. */
  nextAttemptAt: number | null;
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
  /**
   * Snapshot of the channel's guaranteed-delivery setting at intake time.
   * Stored on the row so `recoverOnStartup` (which runs before channel
   * policies are resolved) knows whether to requeue or fail an interrupted
   * row. Defaults to false.
   */
  guaranteedDelivery?: boolean;
}

/** Input payload for {@link DurableQueue.enqueueRejected}. */
export interface EnqueueRejectedInput extends EnqueueInput {
  lastError: string;
}

/**
 * Outcome of an intake attempt. `duplicate` means a prior row for the same
 * `(channel, msg_control_id)` already exists in a non-`nacked` state (queued,
 * processing, processed, rejected, or failed) — the caller compares bodies to
 * decide between replaying the prior ACK and rejecting the collision (§8).
 */
export type EnqueueResult = { kind: 'inserted'; row: InboundRow } | { kind: 'duplicate'; existing: InboundRow };
