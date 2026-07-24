// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AckCode, AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, Hl7Message, normalizeErrorString, sleep } from '@medplum/core';
import type { App } from '../app';
import type { DurableQueue } from './durable-queue';
import type { InboundRow } from './types';
import {
  AckOutcome,
  ArBehavior,
  DEFAULT_AR_BEHAVIOR,
  GUARANTEED_TERMINAL_CODES,
  MessageState,
  PERMANENT_ERROR_CODES,
  QueueError,
  QueueErrorCode,
  QueueLeaseError,
  RETRYABLE_ERROR_CODES,
} from './types';

/**
 * Maximum time we wait for the Medplum server to respond to an
 * `agent:transmit:request` before timing out and marking the row errored.
 */
export const DEFAULT_WORKER_RESPONSE_TIMEOUT_MS = 60_000;

/** Polling delay when the queue is empty (in addition to wake-on-notify). */
export const DEFAULT_WORKER_IDLE_POLL_MS = 250;

/**
 * The channel's retry behavior, as a single configuration knob. Collapses what
 * would otherwise be two orthogonal booleans (auto-retry on/off × guaranteed
 * delivery on/off) into the three combinations that actually make sense, so the
 * invalid "guaranteed but not retrying" state is unrepresentable:
 * - `none`: no auto-retry — a failed Bot leg lands terminal immediately.
 * - `normal`: retry only the transient failures ({@link RETRYABLE_ERROR_CODES}),
 *   up to `maxAttempts`; ambiguous codes are left `failed` for operator review.
 * - `guaranteed`: keep retrying every failure (ambiguous codes included) until
 *   upstream answers definitively; unlimited attempts. **The default** — see
 *   {@link DEFAULT_RETRY_POLICY} for why.
 *
 * Configured via the `retryMode` endpoint URL param or the `channelRetryMode`
 * agent setting; resolved into a {@link RetryPolicy} by `resolveRetryPolicy`.
 */
export const RetryMode = {
  None: 'none',
  Normal: 'normal',
  Guaranteed: 'guaranteed',
} as const;
export type RetryMode = (typeof RetryMode)[keyof typeof RetryMode];

/** The retry mode a channel gets with no configuration: {@link DEFAULT_RETRY_POLICY}. */
export const DEFAULT_RETRY_MODE: RetryMode = RetryMode.Guaranteed;

/**
 * Type guard for a valid {@link RetryMode} string.
 * @param value - The candidate mode (already lower-cased, if applicable).
 * @returns True if `value` is one of `none` / `normal` / `guaranteed`.
 */
export function isRetryMode(value: string | undefined): value is RetryMode {
  return value === RetryMode.None || value === RetryMode.Normal || value === RetryMode.Guaranteed;
}

/**
 * Agent-wide retry defaults, read from the `channelRetryMode` / `channelAutoRetry*`
 * agent settings. Every field is optional; an undefined field falls through to the
 * endpoint URL param's next layer and ultimately {@link DEFAULT_RETRY_POLICY} when
 * a channel resolves its policy (see `resolveRetryPolicy` in hl7.ts).
 */
export interface AgentRetryDefaults {
  mode?: RetryMode;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  backoffMultiplier?: number;
}

/**
 * Per-channel auto-retry policy for the **Path-2** leg (queue → Bot), resolved
 * from endpoint query params layered over agent settings (see
 * `resolveRetryPolicy` in hl7.ts). It governs ONLY re-dispatch of a `failed`
 * row's Bot leg — never the source-leg ACK delivery (that recovers via Path-1
 * source retransmit, not re-dispatch).
 *
 * The policy never retries on the `failed` state alone. It gates on the row's
 * {@link QueueErrorCode}:
 * - Normal mode: retry only the transient codes ({@link RETRYABLE_ERROR_CODES}).
 *   Ambiguous codes (response timeout, interrupted, worker-stopped, dispatch
 *   failure) are left `failed` for operator review — the server may already have
 *   processed the message, so re-dispatch could double-process.
 * - guaranteedDelivery mode: retry every failure (ambiguous codes included,
 *   duplication risk accepted) until upstream gives a definitive answer — an
 *   MSA-1 of AA/CA (settled) or AR/CR (terminal {@link GUARANTEED_TERMINAL_CODES}).
 *
 * guaranteedDelivery is the **default** today — see {@link DEFAULT_RETRY_POLICY}
 * for why. Operators who cannot tolerate duplicates should try `normal` mode
 * (`retryMode=normal`) and dedupe in their Bot.
 */
export interface RetryPolicy {
  /**
   * Master switch: false only when {@link RetryMode.None}. Derived from the
   * resolved {@link RetryMode} (`none` → false, `normal`/`guaranteed` → true).
   */
  enabled: boolean;
  /**
   * Keep retrying until upstream gives a definitive answer for the message
   * (MSA-1 of AA/CA → processed, AR/CR → rejected), even across the ambiguous
   * failures that could cause duplicate delivery. True only for
   * {@link RetryMode.Guaranteed} — **the default** (see {@link DEFAULT_RETRY_POLICY}).
   * Derived from the resolved {@link RetryMode}, so it can never be true while
   * {@link enabled} is false.
   */
  guaranteedDelivery: boolean;
  /** Delay before the first retry. */
  baseDelayMs: number;
  /** Cap on the computed backoff delay. */
  maxDelayMs: number;
  /** Total dispatch attempts before a retryable failure becomes terminal. 0 = retry indefinitely. */
  maxAttempts: number;
  /** Exponential base: delay = baseDelayMs * backoffMultiplier^(attempt-1). 1 = fixed interval. */
  backoffMultiplier: number;
}

/**
 * Cap on dispatch attempts in **normal** (non-guaranteed) mode before a
 * transient failure becomes terminal `failed`. guaranteedDelivery overrides this
 * to 0 (unlimited) — it cannot guarantee delivery while giving up after N tries.
 * Kept separate from {@link DEFAULT_RETRY_POLICY} because the default policy is
 * guaranteed (maxAttempts 0); this is the fallback only when a channel opts out.
 */
export const DEFAULT_NORMAL_MODE_MAX_ATTEMPTS = 10;

/**
 * The policy a channel gets with zero configuration: **guaranteed at-least-once
 * delivery**, retrying every failure indefinitely (`maxAttempts: 0`).
 *
 * This is guaranteed-by-default for a historical reason: the Medplum server's
 * agent WebSocket transmit handler collapses every Bot-execution failure to HTTP
 * 400 (ws/agent.ts) and does NOT disambiguate a permanent rejection from a
 * transient/ephemeral one. With no reliable transient-vs-permanent signal, the
 * only safe default is to assume every error might be ephemeral and keep
 * retrying — otherwise a retryable failure would be silently dropped. The cost
 * is possible duplicate delivery; operators who cannot tolerate duplicates
 * should try `normal` mode (`retryMode=normal`) or dedupe in their Bot — e.g. record
 * processed message control IDs on a FHIR resource such as `MessageHeader` and
 * skip a control ID that has already been handled.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  enabled: true,
  guaranteedDelivery: true,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  maxAttempts: 0,
  backoffMultiplier: 2,
};

/**
 * Computes the backoff before the next retry, with **equal jitter** applied.
 *
 * The deterministic part grows exponentially and is capped at `maxDelayMs`:
 * `min(maxDelayMs, baseDelayMs * backoffMultiplier^(attempt-1))`. We then keep
 * half of that as a fixed floor and randomize the other half, so the result lands
 * uniformly in `[capped/2, capped]`.
 *
 * Jitter matters here because failures are correlated: a server outage or a fleet
 * reconnect (see the liveness gate in {@link ChannelQueueWorker.loop}) fails many
 * rows across many channels/agents at once. Without jitter they all retry on the
 * same exponential schedule and re-synchronize the load spike on every attempt.
 * Equal jitter (AWS, "Exponential Backoff And Jitter") decorrelates them while the
 * half-fixed floor keeps `baseDelayMs` a meaningful minimum — full jitter could
 * fire a retry almost immediately, undercutting the configured delay.
 * @param policy - The channel's retry policy.
 * @param failedAttemptCount - How many dispatch attempts have failed so far (>= 1).
 * @returns Backoff delay before the next attempt, in milliseconds.
 */
export function computeRetryDelayMs(policy: RetryPolicy, failedAttemptCount: number): number {
  const exponent = Math.max(0, failedAttemptCount - 1);
  const capped = Math.min(policy.maxDelayMs, policy.baseDelayMs * policy.backoffMultiplier ** exponent);
  const half = capped / 2;
  // Round to a whole millisecond: the delay is added to Date.now() and written to
  // next_attempt_at, an INTEGER column in a STRICT table — a fractional value would
  // be rejected at bind time and crash the worker loop.
  return Math.round(half + Math.random() * half);
}

/**
 * Separator between a row's stable {@link InboundRow.callbackId} and the attempt
 * number in a dispatch's wire-level callback. Chosen because `callbackId` is
 * always `Agent/{agentId}-{uuid}` (see `AgentHl7ChannelConnection.handleMessage`)
 * and can never itself contain `#`.
 */
const DISPATCH_CALLBACK_SEPARATOR = '#';

/**
 * Builds the wire-level `callback` sent on an `agent:transmit:request` for one
 * dispatch attempt.
 *
 * Auto-retry means a row's `callbackId` is no longer a 1:1 correlation ID: it
 * can be dispatched more than once, and the server response for an EARLIER
 * attempt can arrive after a LATER attempt is already in flight (the earlier
 * one merely timed out locally; the server may still answer it). Encoding the
 * attempt into the wire callback lets {@link ChannelQueueWorker.onServerResponse}
 * tell which attempt a response actually answers, instead of assuming any
 * response bearing the row's `callbackId` must be for whichever attempt is
 * currently pending — see DURABLE_QUEUE_ARCHITECTURE.md §4.1.
 *
 * The server treats `callback` as an opaque passthrough string (it only echoes
 * it back unchanged on the response — see `ws/agent.ts` `handleTransmit`), so
 * embedding structure into it is safe.
 * @param callbackId - The row's stable callback ID.
 * @param attemptCount - The attempt this dispatch represents (the row's
 *   `attemptCount` at claim time).
 * @returns The wire-level callback string for this attempt.
 */
export function buildDispatchCallback(callbackId: string, attemptCount: number): string {
  return `${callbackId}${DISPATCH_CALLBACK_SEPARATOR}${attemptCount}`;
}

/** A wire-level dispatch callback, decoded into its row identity and attempt number. */
export interface ParsedDispatchCallback {
  /** The row's stable callback ID — matches {@link InboundRow.callbackId}. */
  callbackId: string;
  /** The attempt this response answers. */
  attempt: number;
}

/**
 * Inverse of {@link buildDispatchCallback}. Returns undefined for anything that
 * doesn't match the `{callbackId}#{attempt}` shape (e.g. a legacy non-durable
 * transmit's plain callback, or a malformed/foreign value) — the caller treats
 * that the same as "no matching row."
 * @param wireCallback - The `callback` echoed back on an `agent:transmit:response`.
 * @returns The decoded `{ callbackId, attempt }`, or undefined if unparseable.
 */
export function parseDispatchCallback(wireCallback: string): ParsedDispatchCallback | undefined {
  const idx = wireCallback.lastIndexOf(DISPATCH_CALLBACK_SEPARATOR);
  if (idx <= 0 || idx === wireCallback.length - 1) {
    return undefined;
  }
  const callbackId = wireCallback.slice(0, idx);
  const attempt = Number(wireCallback.slice(idx + 1));
  if (!Number.isInteger(attempt) || attempt < 1) {
    return undefined;
  }
  return { callbackId, attempt };
}

export interface ChannelQueueWorkerOptions {
  channelName: string;
  app: App;
  queue: DurableQueue;
  log: ILogger;
  /** Auto-retry policy; default {@link DEFAULT_RETRY_POLICY} (enabled, guaranteed delivery). */
  retryPolicy?: RetryPolicy;
  /**
   * What to do when a message lands terminally `rejected`; default
   * {@link DEFAULT_AR_BEHAVIOR} (`continue`). `pause` stops the channel draining
   * while a rejected row exists (enforced in the claim SQL); `continue` keeps
   * draining past it. See {@link ArBehavior}.
   */
  arBehavior?: ArBehavior;
  /** Override for unit tests; default {@link DEFAULT_WORKER_RESPONSE_TIMEOUT_MS}. */
  responseTimeoutMs?: number;
  /** Override for unit tests; default {@link DEFAULT_WORKER_IDLE_POLL_MS}. */
  idlePollMs?: number;
  /**
   * How to deliver the app-level ACK back to the source device. Injected (not
   * read off the channel) so the worker can stay agnostic about which channel
   * type owns it and so tests don't need a real socket.
   *
   * Returning `false` signals source-leg delivery failure (e.g. socket closed) —
   * the row is still `processed` (the Bot accepted it) but with ack_outcome
   * `undelivered`, never a Bot-leg error.
   */
  sendAck: (response: AgentTransmitResponse, row: InboundRow) => boolean;
}

interface PendingResponse {
  row: InboundRow;
  /** The wire-level callback sent for THIS dispatch attempt — see {@link buildDispatchCallback}. */
  wireCallback: string;
  resolve: (response: AgentTransmitResponse) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Sentinel rejection used when an in-flight row was returned to `queued` by
 * {@link ChannelQueueWorker.onWebSocketDisconnect} — tells {@link ChannelQueueWorker.process}
 * the row already has its final (non-errored) state and needs no further handling.
 */
class RowRequeuedError extends Error {
  constructor() {
    super('row requeued after WebSocket disconnect');
  }
}

/**
 * Per-channel serial worker that drains the durable queue.
 *
 * One running tick at a time per channel — exactly the per-channel ordering
 * guarantee §1.1 promises. Cross-channel parallelism is achieved by running
 * one worker instance per channel.
 *
 * Lifecycle:
 * - {@link start} starts the dispatch loop in the background.
 * - {@link notify} is called whenever a new row is inserted so the loop wakes
 *   immediately instead of waiting on the idle poll.
 * - {@link onServerResponse} is called from `app.ts` when the server replies;
 *   it resolves the in-flight pending promise.
 * - {@link stop} drains the in-flight row (if any) and stops claiming new ones.
 */
export class ChannelQueueWorker {
  readonly channelName: string;
  private readonly app: App;
  private readonly queue: DurableQueue;
  private readonly log: ILogger;
  private readonly responseTimeoutMs: number;
  private readonly idlePollMs: number;
  private readonly sendAck: ChannelQueueWorkerOptions['sendAck'];
  private retryPolicy: RetryPolicy;
  private arBehavior: ArBehavior;

  private running = false;
  private stopping = false;
  private loopPromise: Promise<void> | undefined;
  // Resolves whenever `notify()` is called, then is replaced with a fresh promise.
  // Lets the loop sleep without polling when the queue is known-empty.
  private wakeSignal: { promise: Promise<void>; resolve: () => void };
  private pending: PendingResponse | undefined;

  constructor(options: ChannelQueueWorkerOptions) {
    this.channelName = options.channelName;
    this.app = options.app;
    this.queue = options.queue;
    this.log = options.log;
    this.responseTimeoutMs = options.responseTimeoutMs ?? DEFAULT_WORKER_RESPONSE_TIMEOUT_MS;
    this.idlePollMs = options.idlePollMs ?? DEFAULT_WORKER_IDLE_POLL_MS;
    this.sendAck = options.sendAck;
    this.retryPolicy = options.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.arBehavior = options.arBehavior ?? DEFAULT_AR_BEHAVIOR;
    this.wakeSignal = makeWakeSignal();
  }

  /**
   * Replaces the retry policy. Called on channel config reloads — the worker
   * outlives `reloadConfig`, so policy changes are pushed rather than re-read.
   * Applies to the next failure; an already-scheduled retry keeps its delay.
   * @param policy - The newly resolved policy.
   */
  setRetryPolicy(policy: RetryPolicy): void {
    this.retryPolicy = policy;
  }

  /**
   * Replaces the AR (application-reject) behavior. Called on channel config
   * reloads — the worker outlives `reloadConfig`, so the change is pushed rather
   * than re-read. Takes effect on the next `claimNext`: switching to `continue`
   * lets a channel that was paused on a reject resume draining; switching to
   * `pause` stops it at the next reject (or immediately, if one already exists).
   * @param behavior - The newly resolved behavior.
   */
  setArBehavior(behavior: ArBehavior): void {
    this.arBehavior = behavior;
  }

  /** Starts the dispatch loop. No-op if already started. */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.stopping = false;
    // Tie the in-flight lease check to the App's existing 10s heartbeat rather than
    // a dedicated timer (same idiom as the WAL checkpoint / stats GC listeners).
    this.app.heartbeatEmitter.addEventListener('heartbeat', this.onHeartbeat);
    this.loopPromise = this.loop().catch((err) => {
      this.log.error(`Worker loop crashed: ${normalizeErrorString(err)}`);
    });
  }

  /**
   * @returns True while the dispatch loop is live. Goes false after {@link stop}
   * or after the worker self-terminates on lease loss — the channel checks this
   * to reap a demoted worker before starting a fresh one on re-acquisition.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * In-flight lease check, fired on each App heartbeat tick (~10s). While a
   * dispatch is awaiting the server, a worker can't notice via `claimNext` that a
   * peer took the lease — it's wedged on the response. This cancels that wedged
   * dispatch with a {@link QueueLeaseError} so the loop tears the worker down,
   * instead of waiting out the full {@link DEFAULT_WORKER_RESPONSE_TIMEOUT_MS}. A
   * no-op while no dispatch is pending — an idle worker detects loss far sooner on
   * its next `claimNext` poll. An arrow field so add/removeEventListener share one
   * stable reference.
   */
  private readonly onHeartbeat = (): void => {
    const pending = this.pending;
    if (!pending || !this.queue.isLeaseHeldByPeer()) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending = undefined;
    pending.reject(new QueueLeaseError(undefined, this.queue.getCurrentLease()?.holder));
  };

  /**
   * Signals to the loop that work may be available. Idempotent; multiple calls
   * before the loop wakes coalesce into a single wake.
   */
  notify(): void {
    this.wakeSignal.resolve();
  }

  /**
   * Routes a server `agent:transmit:response` to its row.
   *
   * The common case is the response to the current in-flight dispatch, matched
   * by comparing the exact wire-level callback (row callbackId + attempt number,
   * see {@link buildDispatchCallback}) — this resolves the pending promise and
   * lets {@link process} settle the row.
   *
   * A response can also arrive *late* — after the response timeout already
   * cleared the pending dispatch. Two distinct cases fall out of decoding the
   * attempt number:
   * - **Stale**: the response answers an EARLIER attempt than the row's current
   *   one (a newer attempt has already been claimed and is running, or has
   *   already settled). Auto-retry makes this reachable in a way it never was
   *   before: the row's `callbackId` alone can't distinguish attempts, so without
   *   the attempt number a stale response would misattribute its outcome to
   *   whichever attempt happens to be running now. We discard it — the current
   *   attempt's own response (or timeout) is authoritative.
   * - **Late-for-current-attempt**: the response answers the row's CURRENT
   *   attempt but arrived after we stopped waiting for it (the row is now
   *   `failed`, or `queued` awaiting its own already-scheduled retry). The
   *   Medplum server is the authority on the Bot-leg outcome, so we apply it to
   *   settle the row ({@link applyServerResponse}) exactly as if it had arrived
   *   in time — this disambiguates the ambiguous `ResponseTimeout` case and
   *   avoids a redundant re-dispatch.
   * @param response - The response message received over the WS.
   * @returns True if the response was applied or resolved a pending dispatch;
   *          false if it could not be matched to a settleable row.
   */
  onServerResponse(response: AgentTransmitResponse): boolean {
    if (!response.callback) {
      return false;
    }
    const pending = this.pending;
    if (pending?.wireCallback === response.callback) {
      clearTimeout(pending.timeout);
      this.pending = undefined;
      pending.resolve(response);
      return true;
    }

    const parsed = parseDispatchCallback(response.callback);
    if (!parsed) {
      this.log.warn(`Discarding server response with an unparseable callback (callback=${response.callback})`);
      return false;
    }
    const row = this.queue.findByCallback(parsed.callbackId);
    if (!row) {
      this.log.warn(`Discarding server response with no matching row (callback=${response.callback})`);
      return false;
    }
    if (parsed.attempt !== row.attemptCount) {
      // Stale: this response is for an attempt the row has since moved past.
      this.log.info(
        `Discarding stale server response for row id=${row.id}: response answers attempt ${parsed.attempt}, row is now on attempt ${row.attemptCount}`
      );
      return false;
    }
    // The response answers the row's current attempt but arrived after we
    // stopped waiting for it. Settleable exactly when nothing currently owns
    // this attempt's outcome: `failed` (terminal-for-now, never re-claimed) or
    // `queued` with a retry already scheduled for this same attempt.
    const settleable =
      row.state === MessageState.FAILED || (row.state === MessageState.QUEUED && row.nextAttemptAt !== null);
    if (!settleable) {
      // claimed/inflight (we lost track of our own pending dispatch — shouldn't
      // normally happen), processed/rejected (already settled), a fresh `queued`
      // row (never dispatched — attempt 0, unreachable here since attempt >= 1),
      // or nacked — the outcome is owned elsewhere; don't double-apply.
      this.log.warn(
        `Discarding server response for row id=${row.id} in state '${row.state}' (callback=${response.callback})`
      );
      return false;
    }
    this.log.info(
      `Applying late server response to row id=${row.id} ` +
        `(control id=${row.msgControlId ?? 'n/a'}, state=${row.state}, status=${response.statusCode ?? 'n/a'})`
    );
    try {
      this.applyServerResponse(row, response);
    } catch (err) {
      if (err instanceof QueueLeaseError) {
        // A peer owns the lease now — this row is theirs to settle, not ours.
        this.log.info(`Discarding late server response for row id=${row.id}: queue lease held by a peer`);
        return false;
      }
      throw err;
    }
    return true;
  }

  /**
   * Stops the dispatch loop. Cancels any in-flight dispatch by rejecting its
   * pending response Promise with `worker-stopped` — an ambiguous outcome (we
   * don't know whether the server processed the message). The row is marked
   * `failed` for operator review; an operator decides whether to replay.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.stopping = true;
    this.app.heartbeatEmitter.removeEventListener('heartbeat', this.onHeartbeat);
    if (this.pending) {
      const pending = this.pending;
      clearTimeout(pending.timeout);
      this.pending = undefined;
      pending.reject(new QueueError(QueueErrorCode.WorkerStopped, 'worker stopping'));
    }
    // Wake the loop so it observes `stopping`.
    this.notify();
    if (this.loopPromise) {
      await this.loopPromise;
    }
    this.running = false;
  }

  /** @returns True if a row is currently in-flight (worker awaiting a server response). */
  hasInFlight(): boolean {
    return this.pending !== undefined;
  }

  /**
   * Called from `app.ts` when the agent WebSocket closes. If the in-flight
   * row's `agent:transmit:request` is still sitting unsent in the app's WS
   * queue, the server provably never saw it — remove it and return the row to
   * `queued` so it retries on reconnect instead of timing out into `failed`.
   *
   * If the request already went out on the wire, the outcome is ambiguous (the
   * server may have processed it and the response was lost), so we leave the
   * pending dispatch alone and let the response timeout mark it `errored`.
   */
  onWebSocketDisconnect(): void {
    const pending = this.pending;
    if (!pending) {
      return;
    }
    if (!this.app.removeUnsentTransmit(pending.wireCallback)) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending = undefined;
    try {
      this.queue.requeue(pending.row.id);
    } catch (err) {
      if (err instanceof QueueLeaseError) {
        // Demoted mid-disconnect: leave the row `claimed` for the new leader's
        // recoverOnStartup to requeue, and tear ourselves down via the rejection.
        pending.reject(err);
        return;
      }
      throw err;
    }
    this.log.info(
      `Row id=${pending.row.id} (control id=${pending.row.msgControlId ?? 'n/a'}) requeued: WebSocket disconnected before transmit was sent`
    );
    pending.reject(new RowRequeuedError());
  }

  private async loop(): Promise<void> {
    try {
      while (!this.stopping) {
        // Don't claim while the server connection is down — a dispatch started
        // now would only sit in the in-memory WS queue until the response timer
        // errored it. Rows stay durably `queued` and drain on reconnect (§9);
        // app.ts notifies us when the connection comes back.
        if (!this.app.isLive()) {
          await this.waitForWork();
          continue;
        }
        // `arBehavior=pause` (the default) gates the claim in SQL: while the
        // channel has a `rejected` row, claimNext returns null and the loop parks
        // exactly as it does for an empty queue, resuming automatically once an
        // operator clears the reject. `continue` never gates.
        const row = this.queue.claimNext(this.channelName, undefined, this.arBehavior === ArBehavior.PAUSE);
        if (row) {
          await this.process(row);
        } else {
          await this.waitForWork();
        }
      }
    } catch (err) {
      if (!(err instanceof QueueLeaseError)) {
        throw err; // a genuine crash — surfaces via start()'s loopPromise .catch
      }
      // A peer took the lease (detected at claimNext, the in-flight watchdog, or a
      // terminal write). Stop driving the queue and step down. We deliberately
      // leave any row we had mid-flight untouched (it stays `claimed`/`inflight`)
      // for the new leader's recoverOnStartup to reconcile — a demoted process
      // must not write dispatch state. The channel reaps this stopped worker and
      // starts a fresh one if we later reacquire (AgentHl7Channel.maybeStartWorker).
      this.log.info(`Worker for channel '${this.channelName}' stepping down: queue lease taken by a peer.`);
      this.stopping = true;
      this.app.heartbeatEmitter.removeEventListener('heartbeat', this.onHeartbeat);
      this.running = false;
    }
  }

  private async process(row: InboundRow): Promise<void> {
    let response: AgentTransmitResponse | undefined;
    try {
      response = await this.dispatch(row);
    } catch (err) {
      if (err instanceof RowRequeuedError) {
        // onWebSocketDisconnect already returned the row to `queued`; the loop's
        // liveness gate keeps it there until the connection comes back.
        return;
      }
      if (err instanceof QueueLeaseError) {
        // Lost the lease mid-dispatch (the watchdog cancelled the in-flight wait,
        // or a terminal write was refused). Propagate so the loop tears the worker
        // down; do NOT settle the row — it's the new leader's to reconcile.
        throw err;
      }
      // A dispatch-leg failure (timeout, worker-stopped, unclassified) is always
      // transient/ambiguous — never a rejection of the message. handleFailure
      // gates it: review-only in normal mode, retried under guaranteed delivery.
      const code = err instanceof QueueError ? err.code : QueueErrorCode.DispatchFailed;
      this.handleFailure(row, code, normalizeErrorString(err));
      return;
    }

    this.applyServerResponse(row, response);
  }

  /**
   * Settles a row from its server `agent:transmit:response`: records the raw
   * response, then transitions the row by status — 2xx → `processed` (plus the
   * source-leg ACK), permanent 4xx → `rejected`, 5xx/429 → `failed`.
   *
   * Shared by the normal in-flight path ({@link process}) and the late-response
   * path ({@link onServerResponse}), so a response that arrives after the
   * response timeout settles the row identically to one that arrived in time.
   * @param row - The row the response belongs to.
   * @param response - The server response to apply.
   */
  private applyServerResponse(row: InboundRow, response: AgentTransmitResponse): void {
    this.queue.recordServerResponse(row.id, response.statusCode ?? null, response.body ?? null);

    const statusCode = response.statusCode ?? 0;
    if (this.retryPolicy.guaranteedDelivery) {
      // Guaranteed delivery: the upstream HL7 ACK code (MSA-1) is the source of
      // truth, not the HTTP status. Rather than reason about the full (ackCode ×
      // statusCode) matrix at once, resolve the ACK code first — every definitive
      // code settles the row and returns here — and only fall back to the HTTP
      // status when the body carried no parseable ACK. Whatever reaches the code
      // below is, by elimination, an accepted message.
      const ackCode = parseAckCode(response.body);
      switch (ackCode) {
        case 'AR':
        case 'CR':
          // Definitive upstream reject: this IS the Bot's real application-level
          // answer (not a transport failure), so the source is owed it just like
          // any other completed attempt — relay it, then land the row terminally
          // `rejected`. Never retried (UpstreamRejected is the one code that
          // stops even guaranteed mode — see GUARANTEED_TERMINAL_CODES), so the
          // relay never risks a later contradictory ACK.
          this.settleWithAck(
            row,
            response,
            QueueErrorCode.UpstreamRejected,
            `Upstream rejected the message (${ackCode}): ${response.body ?? ''}`
          );
          return;
        case 'AE':
        case 'CE':
          // Error ACK: NOT a definitive answer, so guaranteed mode keeps
          // retrying — deliberately withOUT relaying this ACK to the source.
          // Relaying it now and then sending a later AA once a retry succeeds
          // would give the source two contradictory acknowledgments for the
          // same message.
          this.handleFailure(
            row,
            QueueErrorCode.UpstreamError,
            `Upstream returned an error ACK (${ackCode}): ${response.body ?? ''}`
          );
          return;
        case undefined:
          // No parseable ACK: fall back to the HTTP status. A 4xx/5xx retries —
          // the duplication risk the operator opted into by enabling guaranteed
          // delivery — while anything below 400 is treated as accepted.
          if (statusCode >= 400) {
            this.handleFailure(
              row,
              classifyStatusCode(statusCode),
              `Server returned ${statusCode}: ${response.body ?? ''}`
            );
            return;
          }
          break;
        case 'AA':
        case 'CA':
          // Accepted: fall through to the success path below.
          break;
        default:
          // Exhaustiveness: every AckCode is handled above. If a new code is
          // added to the union, this fails to compile until it is handled here.
          ackCode satisfies never;
      }
    } else if (statusCode >= 400) {
      // Normal mode: the HTTP status is the Bot-leg verdict. A permanent 4xx is
      // a `rejected` message (never retried); 5xx / 429 is a transient `failed`
      // (auto-retried). handleFailure applies that gate.
      this.handleFailure(row, classifyStatusCode(statusCode), `Server returned ${statusCode}: ${response.body ?? ''}`);
      return;
    }

    // The Bot accepted the message (2xx, or guaranteed-mode AA/CA): the row is
    // `processed`. Delivering the ACK back to the source is a SEPARATE leg
    // recorded in ack_outcome — a closed source connection yields `processed` +
    // `undelivered`, never a Bot-leg failure, and is therefore never
    // re-dispatched. The source recovers it by retransmitting, which replays the
    // stored ACK (handleDuplicate, hl7.ts).
    this.handleProcessed(row, response);
  }

  /**
   * Delivers an app-level ACK back to the source, honoring the `aaMode`
   * suppression rule. Pure source-leg delivery — never touches the row's
   * Bot-leg `state`; callers combine this with whatever DB transition applies.
   *
   * - `aaMode`: the source was already acknowledged by the deferred-commit `AA`
   *   at intake (hl7.ts `handleMessageDurable` → `sendCommitAck`), and aaMode's
   *   contract is "send AA immediately, then ignore any later app-level ACKs"
   *   (hl7 connection). The Bot's app-level ACK would be a redundant *second*
   *   ACK the source is no longer listening for — a source that closes its
   *   connection on ACK has already torn the socket down, producing spurious
   *   "disconnected remote" / "ACK delivery failed" warnings. Suppress the send;
   *   the outcome is a successful no-op ({@link AckOutcome.DELIVERED}), the same
   *   convention used for other policy-suppressed sends.
   * - Otherwise: {@link sendAck} attempts delivery. Success →
   *   {@link AckOutcome.DELIVERED}; a failed send (e.g. the source closed its
   *   socket after its own ACK) → {@link AckOutcome.UNDELIVERED}. An undelivered
   *   ACK is NOT a failure and is never re-dispatched — the source recovers it by
   *   retransmitting, which replays the stored ACK (hl7.ts `handleDuplicate`).
   * @param row - The row whose `enhancedMode` governs suppression.
   * @param response - The response whose body becomes the relayed ACK.
   * @returns Delivery outcome: `ackOk` (true = delivered) and, on a thrown send, `ackError`.
   */
  private relayAckToSource(row: InboundRow, response: AgentTransmitResponse): { ackOk: boolean; ackError: unknown } {
    if (row.enhancedMode === 'aaMode') {
      this.log.debug(
        `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) app-level ACK suppressed (aaMode commit ACK already acknowledged the source)`
      );
      return { ackOk: true, ackError: undefined };
    }
    let ackOk = false;
    let ackError: unknown;
    try {
      ackOk = this.sendAck(response, row);
    } catch (err) {
      ackError = err;
    }
    return { ackOk, ackError };
  }

  /**
   * Settles a row the Bot accepted, then delivers the app-level ACK back to the
   * source as a SEPARATE leg tracked in `ack_outcome`.
   *
   * The row is always marked `processed` here — Bot-leg success is already
   * decided by the caller ({@link applyServerResponse}).
   * @param row - The row the Bot accepted; `attemptCount` reflects the successful attempt.
   * @param response - The Bot's transmit response, used to build the ACK sent to the source.
   */
  private handleProcessed(row: InboundRow, response: AgentTransmitResponse): void {
    const { ackOk, ackError } = this.relayAckToSource(row, response);
    if (!this.queue.markProcessed(row.id, row.attemptCount, ackOk ? AckOutcome.DELIVERED : AckOutcome.UNDELIVERED)) {
      // This attempt was superseded before we could record it (e.g. a peer took
      // the dispatch lease between the response arriving and this write) — the
      // ACK we may have just sent is the new owner's business to reconcile, not
      // ours to also record.
      this.log.info(
        `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) processed-state write discarded: attempt ${row.attemptCount} was already superseded`
      );
      return;
    }
    if (row.attemptCount > 1) {
      this.log.info(
        `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) Bot leg succeeded after ${row.attemptCount} attempts`
      );
    }
    if (!ackOk) {
      const detail = ackError ? `: ${normalizeErrorString(ackError)}` : '';
      this.log.warn(
        `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) processed upstream but ACK delivery to source failed${detail}; awaiting source retransmit to replay`
      );
    }
  }

  /**
   * Settles a row on a **definitive upstream reject** (MSA-1 of AR/CR): relays
   * the reject ACK to the source — it's the Bot's real application-level
   * answer, and `UpstreamRejected` never retries, so there's no risk of a later
   * contradictory ACK — then lands the row `rejected` via {@link handleFailure}.
   *
   * Distinct from {@link handleFailure}'s other callers: those describe
   * transport/HTTP-leg failures with no app-level ACK to relay (the row settles
   * with `ack_outcome = 'not_owed'`); this is the one failure classification
   * that carries a real Bot answer, so the ack_outcome is overwritten to reflect
   * whether that answer actually reached the source.
   * @param row - The row the Bot answered with a definitive reject.
   * @param response - The Bot's transmit response, used to build the ACK sent to the source.
   * @param code - Always {@link QueueErrorCode.UpstreamRejected} today; threaded through {@link handleFailure} regardless.
   * @param message - Human-readable error, written to `last_error`.
   */
  private settleWithAck(row: InboundRow, response: AgentTransmitResponse, code: QueueErrorCode, message: string): void {
    const { ackOk, ackError } = this.relayAckToSource(row, response);
    const settled = this.handleFailure(row, code, message);
    if (!settled) {
      // Superseded before the terminal write applied — same reasoning as
      // handleProcessed's discard: don't touch ack_outcome for an attempt that
      // no longer owns the row.
      return;
    }
    this.queue.setAckOutcome(row.id, ackOk ? AckOutcome.DELIVERED : AckOutcome.UNDELIVERED);
    if (!ackOk) {
      const detail = ackError ? `: ${normalizeErrorString(ackError)}` : '';
      this.log.warn(
        `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) rejected upstream but ACK delivery to source failed${detail}; awaiting source retransmit to replay`
      );
    }
  }

  /**
   * Single decision point for every post-commit Bot-leg failure — where the
   * two-path split actually changes retry behavior.
   *
   * The retry GATE keys off the {@link QueueErrorCode}, NEVER the `failed` state
   * alone (which holds transient AND ambiguous codes):
   * - Normal mode: retry only the **transient** codes ({@link RETRYABLE_ERROR_CODES}:
   *   `ServerError`/5xx, `ServerRateLimited`/429) — they cannot duplicate work
   *   because the server provably never accepted the message. The **ambiguous**
   *   codes (`ResponseTimeout`, `Interrupted`, `WorkerStopped`, `DispatchFailed`)
   *   are NOT retried: the server may already have processed the message, so a
   *   blind re-dispatch could double-process. They stay `failed` for operator
   *   review.
   * - guaranteedDelivery mode: retry everything except a definitive upstream
   *   reject ({@link GUARANTEED_TERMINAL_CODES}) — ambiguous codes included,
   *   accepting the duplication risk.
   *
   * A retry stays `queued` (via {@link DurableQueue.scheduleRetry}); otherwise the
   * terminal state is chosen by classification — permanent codes
   * ({@link PERMANENT_ERROR_CODES}) → `rejected`, everything else → `failed`.
   *
   * Every write here is attempt-scoped (guarded on `row.attemptCount` matching
   * the row's CURRENT `attempt_count` — see {@link DurableQueue.scheduleRetry}):
   * if this attempt has been superseded (a newer claim already bumped the
   * counter, or a peer took the dispatch lease), the write is a no-op instead of
   * corrupting whatever attempt owns the row now.
   * @param row - The row that failed; `attemptCount` reflects the attempt that just failed.
   * @param code - Classification attached at the failure site.
   * @param message - Human-readable error, written to `last_error` either way.
   * @returns True if this call landed the row in a terminal state (`rejected` or
   *   `failed`); false if it scheduled a retry instead, or if the write was
   *   discarded because this attempt was superseded.
   */
  private handleFailure(row: InboundRow, code: QueueErrorCode, message: string): boolean {
    const rowDesc = `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'})`;
    const policy = this.retryPolicy;
    const retryable = policy.guaranteedDelivery
      ? !GUARANTEED_TERMINAL_CODES.has(code)
      : RETRYABLE_ERROR_CODES.has(code);
    if (policy.enabled && retryable) {
      const attemptsRemain = policy.maxAttempts === 0 || row.attemptCount < policy.maxAttempts;
      if (attemptsRemain) {
        const delayMs = computeRetryDelayMs(policy, row.attemptCount);
        if (this.queue.scheduleRetry(row.id, row.attemptCount, message, code, Date.now() + delayMs)) {
          const attemptDesc = `attempt ${row.attemptCount + 1}${policy.maxAttempts > 0 ? `/${policy.maxAttempts}` : ''}`;
          this.log.warn(`${rowDesc} failed (${code}), retrying in ${delayMs}ms (${attemptDesc}): ${message}`);
          return false;
        }
        // Superseded — the terminal write below carries the same attempt_count
        // guard, so it correctly no-ops too instead of stomping on whatever
        // attempt owns the row now.
      } else {
        message = `${message} (${row.attemptCount} attempts exhausted)`;
      }
    }
    // Not retried (or exhausted): land on the terminal state by classification.
    if (PERMANENT_ERROR_CODES.has(code)) {
      const applied = this.queue.markRejected(row.id, row.attemptCount, message, code);
      if (applied) {
        this.log.error(`${rowDesc} rejected (${code}): ${message}`);
        if (this.arBehavior === ArBehavior.PAUSE) {
          // The pause itself is enforced by the SQL claim gate (the next
          // claimNext returns null while this rejected row exists); this log is
          // the operator's signal for why the channel stopped draining.
          this.log.error(
            `Channel '${this.channelName}' paused (arBehavior=pause): ${rowDesc} was rejected, so no further ` +
              `messages will be processed until the rejected row is cleared (reclassify its state or delete it). ` +
              `Set arBehavior=continue to keep draining past rejects instead.`
          );
        }
      } else {
        this.log.info(`${rowDesc} rejected-state write discarded: attempt ${row.attemptCount} was already superseded`);
      }
      return applied;
    }
    // Transient/ambiguous codes the policy isn't retrying — left for operator review.
    const applied = this.queue.markFailed(row.id, row.attemptCount, message, code);
    if (applied) {
      this.log.error(`${rowDesc} failed (${code}, operator review): ${message}`);
    } else {
      this.log.info(`${rowDesc} failed-state write discarded: attempt ${row.attemptCount} was already superseded`);
    }
    return applied;
  }

  private async dispatch(row: InboundRow): Promise<AgentTransmitResponse> {
    // Encode the attempt into the wire callback (see buildDispatchCallback) so a
    // response can be correlated to the exact attempt it answers, not just the row.
    const wireCallback = buildDispatchCallback(row.callbackId, row.attemptCount);
    return new Promise<AgentTransmitResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending?.row.id === row.id) {
          this.pending = undefined;
        }
        reject(
          new QueueError(
            QueueErrorCode.ResponseTimeout,
            `Timed out after ${this.responseTimeoutMs}ms waiting for server response`
          )
        );
      }, this.responseTimeoutMs);
      // node's setTimeout returns a Timeout that keeps the event loop alive by default;
      // .unref() prevents the worker from holding the process open during shutdown drains.
      if (typeof timeout.unref === 'function') {
        timeout.unref();
      }
      this.pending = { row, wireCallback, resolve, reject, timeout };

      this.app.addToWebSocketQueue({
        type: 'agent:transmit:request',
        accessToken: 'placeholder',
        channel: row.channelName,
        remote: row.remote,
        contentType: ContentType.HL7_V2,
        // finalizedMessage holds the decoded HL7 text stored as UTF-8 at intake
        // (see AgentHl7ChannelConnection.handleMessage) — the same body the legacy
        // path forwards. The channel `encoding` is wire-level only and recorded
        // on the row for reference; it does not affect the forwarded text.
        body: row.finalizedMessage.toString('utf8'),
        callback: wireCallback,
      });
    });
  }

  private async waitForWork(): Promise<void> {
    const wake = this.wakeSignal;
    this.wakeSignal = makeWakeSignal();
    // Race the explicit wake against a short timeout — the timeout is a safety
    // net so that if `notify()` is missed (shouldn't happen, but cheap insurance)
    // the loop still makes progress.
    await Promise.race([wake.promise, sleep(this.idlePollMs)]);
  }
}

/**
 * Maps a server HTTP status to a {@link QueueErrorCode}: 5xx and 429 are
 * transient; any other 4xx means the server rejected the message itself.
 * @param statusCode - HTTP-style status code from the server response (>= 400).
 * @returns The classification for this failure.
 */
function classifyStatusCode(statusCode: number): QueueErrorCode {
  if (statusCode === 429) {
    return QueueErrorCode.ServerRateLimited;
  }
  if (statusCode >= 500) {
    return QueueErrorCode.ServerError;
  }
  return QueueErrorCode.ServerRejected;
}

/**
 * Extracts the MSA-1 acknowledgment code from an HL7 ACK body, if there is one.
 * Used in guaranteed-delivery mode, where the upstream ACK code — not the HTTP
 * status — decides whether the message is settled. Anything unparseable returns
 * undefined and the caller falls back to status-code handling.
 * @param body - The server response body (expected to be an HL7 ACK message).
 * @returns The MSA-1 {@link AckCode} (e.g. 'AA', 'AE', 'AR', 'CA', 'CE', 'CR'), or undefined.
 */
function parseAckCode(body: string | undefined): AckCode | undefined {
  if (!body) {
    return undefined;
  }
  try {
    return Hl7Message.parse(body).getAckType();
  } catch {
    return undefined;
  }
}

function makeWakeSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
