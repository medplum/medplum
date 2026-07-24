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
 * - `queued`     — inserted, awaiting worker dispatch; OR a retryable failure
 *                  was scheduled for auto-retry (`next_attempt_at` set, see §4.1).
 * - `delayed`    — a worker claimed the row, computed its logical-channel key,
 *                  and found an earlier not-yet-settled message in the same
 *                  partition, so it parked the row instead of dispatching it. It
 *                  carries no dispatch timestamps and re-enters `queued` when the
 *                  blocking message settles (see the wake-on-settle path), on a
 *                  `logicalChannelKey` spec change, or on startup recovery.
 *                  Non-terminal; invisible to `CLAIM_NEXT`.
 * - `claimed`    — a worker has claimed the row off the queue, but the
 *                  `agent:transmit:request` has NOT yet been written to the
 *                  WebSocket (it's still buffered in the in-memory send queue).
 *                  A crash here is UNAMBIGUOUS — the server provably never saw
 *                  it — so recovery returns it to `queued` (no duplicate risk).
 * - `inflight`   — the request has been written to the socket (`sent_at` stamped)
 *                  and the worker is awaiting the server's response. A crash here
 *                  is AMBIGUOUS (the server may have processed it), so recovery
 *                  marks it `failed` for operator review, never silently retries.
 * - `processed`  — the Bot accepted it (server 2xx). Says nothing about whether
 *                  the source ACK was delivered — see {@link AckOutcome}.
 * - `rejected`   — terminal: the Bot rejected the message itself (permanent 4xx).
 *                  Retrying can never help; the content must be triaged.
 * - `failed`     — terminal-for-now: a transient/ambiguous Bot-leg failure
 *                  (5xx, 429, response timeout, dispatch error, or "interrupted" —
 *                  a row found `inflight` on startup). Default (guaranteed) mode
 *                  retries all of these; normal mode retries only the transient
 *                  codes and leaves the ambiguous ones here for review (see §4.1).
 *                  Never confused with a `rejected` message.
 * - `nacked`     — rejected at intake; sender was told NACK and the row exists only for audit.
 */
export const MessageState = {
  QUEUED: 'queued',
  DELAYED: 'delayed',
  CLAIMED: 'claimed',
  INFLIGHT: 'inflight',
  PROCESSED: 'processed',
  REJECTED: 'rejected',
  FAILED: 'failed',
  NACKED: 'nacked',
} as const;
export type MessageState = (typeof MessageState)[keyof typeof MessageState];

/**
 * States whose Bot-leg outcome is final — no further attempt (retry or
 * otherwise) will ever change `last_error`/`error_code`/`server_response_body`
 * again. Used to gate replay of a stored server response (see `handleDuplicate`
 * in hl7.ts): a `queued`/`delayed`/`claimed`/`inflight` row's response fields can
 * still be superseded by a future attempt, so replaying them to a retransmitting
 * source would risk relaying a stale, no-longer-authoritative verdict.
 */
export const SETTLED_MESSAGE_STATES: ReadonlySet<MessageState> = new Set<MessageState>([
  MessageState.PROCESSED,
  MessageState.REJECTED,
  MessageState.FAILED,
  MessageState.NACKED,
]);

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
 * The Bot-leg codes are grouped into three failure classes — the distinction the
 * retry policy keys off of (see {@link RETRYABLE_ERROR_CODES} and the §4 retry rules):
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
  /** Ambiguous (`failed`): row was in `inflight` when the agent restarted. Review-only in normal mode. */
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
  /** Intake rejection (`nacked`): a storage error prevented the message from being committed. */
  StorageError: 'storage-error',
  /** Intake rejection (`nacked`): the message reused a committed control ID (duplicate collision). */
  DuplicateRejected: 'duplicate-rejected',
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
 * to retry is pointless. (A Bot accept whose source ACK failed is `processed` +
 * `undelivered` and never reaches the retry path at all — see {@link AckOutcome}.)
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

/**
 * Thrown by a gated dispatch operation when a peer holds the queue lease — i.e.
 * this process has been demoted and must stop driving the queue.
 *
 * This is control flow, NOT a dispatch failure: the worker catches it to tear
 * itself down cleanly and must never settle a row from it (the new leader's
 * `recoverOnStartup` reconciles whatever was left mid-flight). The lease check
 * lives in {@link DurableQueue} (see `setLeaseHolder` / `isLeaseHeldByPeer`), so
 * loss is detected at the point of mutation rather than pushed down through a
 * chain of leadership callbacks.
 */
export class QueueLeaseError extends Error {
  /** The holder this process believes it is (the one bound via `setLeaseHolder`). */
  readonly localHolder: string | undefined;
  /** The holder that actually owns the lease now (the peer that took over). */
  readonly currentHolder: string | undefined;

  constructor(localHolder: string | undefined, currentHolder: string | undefined) {
    super(
      `Queue lease held by a peer; this process is no longer leader ` +
        `(local holder=${localHolder ?? 'unset'}, current holder=${currentHolder ?? 'none'})`
    );
    this.name = 'QueueLeaseError';
    this.localHolder = localHolder;
    this.currentHolder = currentHolder;
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
 * Columns present on a row in `inbound_hl7_messages` regardless of its lifecycle
 * {@link MessageState}. Split into two groups:
 *
 * 1. **Intake / identity** — stamped once when the row is inserted and never
 *    change (id, channel, bytes, seq_no, …).
 * 2. **State-independent axes** — written by statements that deliberately do NOT
 *    change `state`, so their value is orthogonal to which state the row is in:
 *    - `ackOutcome` (SET_ACK_OUTCOME): the source-leg delivery result.
 *    - `serverStatusCode` / `serverResponseBody` (RECORD_SERVER_RESPONSE): the
 *      raw server reply, recorded "without changing state" (see queries.ts).
 *    - `lastError` / `errorCode`: the free-form + machine-readable failure
 *      classification, which can linger on a retried `queued` row and is
 *      guaranteed non-null only on the terminal-failure members below.
 *
 * The columns that a *state transition itself* writes — the lifecycle timestamps
 * (`processingStartedAt`, `sentAt`, `processedAt`, `erroredAt`) and the retry
 * schedule (`nextAttemptAt`) — are NOT here: they are the discriminating fields,
 * present only on the {@link InboundRow} members whose state actually sets them.
 */
interface InboundRowBase {
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
  attemptCount: number;
  /**
   * The row's logical channel — the FIFO partition it is processed within.
   * Written at CLAIM time (not intake) from the channel's *current*
   * `logicalChannelKey` spec: a worker computes it right after claiming the row
   * and stores it before dispatching (or when parking the row `delayed`). Empty
   * (`''`, the default) until the row is first evaluated, and whenever the
   * channel has no spec — meaning the channel is a single serialized queue. Rows
   * sharing a key are serialized against each other; distinct keys can run on
   * different pool workers at once. Computing it at claim time (rather than
   * persisting an intake-time key) is what keeps the partition correct across
   * retries, requeues, restarts, and spec changes. See logical-channel.ts and the
   * worker's post-claim partition check.
   */
  logicalChannelKey: string;
  /** Snapshot of the channel's guaranteed-delivery setting at intake (drives crash recovery). */
  guaranteedDelivery: boolean;
  callbackId: string;
  seqNo: number | null;
  receivedAt: number;
  /** Source-leg delivery outcome — independent of `state`. See {@link AckOutcome}. */
  ackOutcome: AckOutcome;
  /** Raw server reply status, recorded independently of `state`; null until a response arrives (or if the server omitted one). */
  serverStatusCode: number | null;
  /** Raw server reply body, recorded independently of `state`; null until a response arrives. */
  serverResponseBody: Buffer | null;
  /** Human-readable failure detail. May linger on a retried `queued` row; non-null on the terminal-failure members. */
  lastError: string | null;
  /** Machine-readable failure classification. See {@link lastError}. */
  errorCode: QueueErrorCode | null;
}

/**
 * `queued` — inserted and awaiting worker dispatch, OR a retryable failure
 * scheduled for auto-retry. Not yet claimed, so it carries none of the dispatch
 * timestamps; a retry-scheduled row additionally sets {@link nextAttemptAt} and
 * a lingering `lastError`/`errorCode`.
 */
export interface QueuedRow extends InboundRowBase {
  state: typeof MessageState.QUEUED;
  /** Earliest time (ms) a retry-scheduled row may be re-claimed; null for a fresh enqueue. */
  nextAttemptAt: number | null;
}

/**
 * `delayed` — parked behind an earlier not-yet-settled message in the same
 * logical channel. A worker claimed it, computed its partition key, found the
 * partition occupied, and set it aside (undoing the claim's attempt increment).
 * It carries no dispatch timestamps and re-enters `queued` when the blocking
 * message settles, on a spec change, or on startup recovery.
 */
export interface DelayedRow extends InboundRowBase {
  state: typeof MessageState.DELAYED;
}

/**
 * `claimed` — a worker owns the row but the `agent:transmit:request` has not yet
 * been written to the socket (`sent_at` is still unset, hence absent here).
 */
export interface ClaimedRow extends InboundRowBase {
  state: typeof MessageState.CLAIMED;
  /** When the worker claimed the row off the queue. */
  processingStartedAt: number;
}

/** `inflight` — the request has been written to the socket and we await the server's response. */
export interface InflightRow extends InboundRowBase {
  state: typeof MessageState.INFLIGHT;
  processingStartedAt: number;
  /** When the transmit request was written to the WebSocket. */
  sentAt: number;
}

/** `processed` — terminal success: the Bot accepted the message (server 2xx / guaranteed-mode AA/CA). */
export interface ProcessedRow extends InboundRowBase {
  state: typeof MessageState.PROCESSED;
  processingStartedAt: number;
  sentAt: number;
  /** When the row was marked processed. */
  processedAt: number;
}

/** `rejected` — terminal permanent failure: the Bot rejected the message itself (permanent 4xx / definitive upstream reject). */
export interface RejectedRow extends InboundRowBase {
  state: typeof MessageState.REJECTED;
  processingStartedAt: number;
  sentAt: number;
  /** When the row was marked rejected. */
  erroredAt: number;
  lastError: string;
  errorCode: QueueErrorCode;
}

/**
 * `failed` — terminal-for-now: a transient/ambiguous Bot-leg failure. `sentAt` is
 * null when the failure occurred before the request reached the socket (an unsent
 * `claimed` row hit a dispatch error), non-null when it went out first (response
 * timeout, interrupted inflight).
 */
export interface FailedRow extends InboundRowBase {
  state: typeof MessageState.FAILED;
  processingStartedAt: number;
  sentAt: number | null;
  /** When the row was marked failed. */
  erroredAt: number;
  lastError: string;
  errorCode: QueueErrorCode;
}

/**
 * `nacked` — intake-reject audit row: the message was NACKed before it was ever
 * committed/dispatched, so it never acquired any dispatch timestamp (not even
 * `errored_at`) and its ack is `not_owed`.
 */
export interface NackedRow extends InboundRowBase {
  state: typeof MessageState.NACKED;
  lastError: string;
  errorCode: QueueErrorCode;
}

/**
 * A row in `inbound_hl7_messages`, decoded into typed JavaScript values, as a
 * discriminated union over {@link MessageState}. Each member exposes only the
 * lifecycle columns that its state actually populates — e.g. a {@link QueuedRow}
 * has no `sentAt`/`processedAt`, and only a {@link ProcessedRow} has `processedAt`.
 * Narrow on `state` (or use {@link assertRowState}) to reach a state's columns.
 *
 * Columns that are `NULL` in SQL surface as `null` here (not `undefined`), so callers
 * can distinguish "not yet set" from "absent property."
 */
export type InboundRow =
  | QueuedRow
  | DelayedRow
  | ClaimedRow
  | InflightRow
  | ProcessedRow
  | RejectedRow
  | FailedRow
  | NackedRow;

/**
 * Narrows a (possibly null) {@link InboundRow} to the union member for `state`,
 * throwing if the row is null/undefined or in a different state. Lets a caller
 * that knows a row's state — from the transition it just performed, or a test
 * that drove the row there — reach that state's columns without hand-written
 * narrowing, while still failing loudly if the assumption is wrong.
 * @param row - The row to check.
 * @param state - The state the row is expected to be in.
 */
export function assertRowState<S extends MessageState>(
  row: InboundRow | null | undefined,
  state: S
): asserts row is Extract<InboundRow, { state: S }> {
  if (!row) {
    throw new Error(`Expected an inbound row in state '${state}', but got ${row === null ? 'null' : 'undefined'}`);
  }
  if (row.state !== state) {
    throw new Error(`Expected inbound row id=${row.id} in state '${state}', but it is '${row.state}'`);
  }
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
   * in-flight row. Defaults to false.
   */
  guaranteedDelivery?: boolean;
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
 * claimed, inflight, processed, rejected, or failed) — the caller compares
 * bodies to decide between replaying the prior ACK and rejecting the collision (§8).
 *
 * `inserted`'s `row` is typed as {@link InboundRow}, not {@link QueuedRow}: the
 * insert itself is what committed the message durably, and by the time we
 * re-read it a peer process sharing the same DB file (e.g. during a
 * zero-downtime-upgrade overlap) may already have claimed or even settled it.
 * That race doesn't change the fact that intake succeeded.
 */
export type EnqueueResult = { kind: 'inserted'; row: InboundRow } | { kind: 'duplicate'; existing: InboundRow };
