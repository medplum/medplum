// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, Hl7Message, normalizeErrorString, sleep } from '@medplum/core';
import type { App } from '../app';
import type { DurableQueue } from './durable-queue';
import type { InboundRow } from './types';
import {
  AckOutcome,
  GUARANTEED_TERMINAL_CODES,
  MessageState,
  PERMANENT_ERROR_CODES,
  QueueError,
  QueueErrorCode,
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
 * for why. Operators who want exactly-once semantics opt out per channel
 * (`guaranteedDelivery=false`) and dedupe in their Bot.
 */
export interface RetryPolicy {
  /** Master switch. On by default; opt out via the autoRetry URL param / channelAutoRetry agent setting. */
  enabled: boolean;
  /**
   * Keep retrying until upstream gives a definitive answer for the message
   * (MSA-1 of AA/CA → processed, AR/CR → rejected), even across the ambiguous
   * failures that could cause duplicate delivery. **On by default** (see
   * {@link DEFAULT_RETRY_POLICY}); opt out per channel with
   * `guaranteedDelivery=false`. Requires `enabled`; policy resolution forces
   * this off when autoRetry is disabled (warning only if it was set explicitly).
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
 * is possible duplicate delivery; operators who need exactly-once should either
 * opt out (`guaranteedDelivery=false`) or dedupe in their Bot — e.g. record
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
 * @param policy - The channel's retry policy.
 * @param failedAttemptCount - How many dispatch attempts have failed so far (>= 1).
 * @returns Backoff delay before the next attempt, in milliseconds.
 */
export function computeRetryDelayMs(policy: RetryPolicy, failedAttemptCount: number): number {
  const exponent = Math.max(0, failedAttemptCount - 1);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * policy.backoffMultiplier ** exponent);
}

export interface ChannelQueueWorkerOptions {
  channelName: string;
  app: App;
  queue: DurableQueue;
  log: ILogger;
  /** Auto-retry policy; default {@link DEFAULT_RETRY_POLICY} (enabled, guaranteed delivery). */
  retryPolicy?: RetryPolicy;
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

  /** Starts the dispatch loop. No-op if already started. */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.stopping = false;
    this.loopPromise = this.loop().catch((err) => {
      this.log.error(`Worker loop crashed: ${normalizeErrorString(err)}`);
    });
  }

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
   * The common case is the response to the current in-flight dispatch, which
   * resolves the pending promise and lets {@link process} settle the row.
   *
   * A response can also arrive *late* — after the response timeout (or a requeue
   * / worker stop) already cleared the pending dispatch and left the row
   * `failed`. We don't discard those: the Medplum server is the authority on the
   * Bot-leg outcome, so a late ACK/NACK for a row that errored and isn't being
   * retried right now is applied to settle the row ({@link applyServerResponse}),
   * exactly as if it had arrived in time. This disambiguates the ambiguous
   * `ResponseTimeout` case — a row we couldn't classify becomes a definite
   * `processed`/`rejected`/`failed` — and avoids a redundant re-dispatch.
   * @param response - The response message received over the WS.
   * @returns True if the response was applied or resolved a pending dispatch;
   *          false if it could not be matched to a settleable row.
   */
  onServerResponse(response: AgentTransmitResponse): boolean {
    if (!response.callback) {
      return false;
    }
    const pending = this.pending;
    if (pending && pending.row.callbackId === response.callback) {
      clearTimeout(pending.timeout);
      this.pending = undefined;
      pending.resolve(response);
      return true;
    }
    // No in-flight dispatch matches this callback — a late response. Look up the
    // row it belongs to and decide whether it's still settleable.
    const row = this.queue.findByCallback(response.callback);
    if (!row) {
      this.log.warn(`Discarding server response with no matching row (callback=${response.callback})`);
      return false;
    }
    if (row.state === MessageState.FAILED) {
      // Errored earlier (most commonly a response timeout) and not currently in
      // flight — `failed` rows are never re-claimed (claimNext only takes
      // `queued`). The server's verdict is authoritative, so settle the row from
      // this late response instead of leaving it ambiguous.
      this.log.info(
        `Applying late server response to errored row id=${row.id} ` +
          `(control id=${row.msgControlId ?? 'n/a'}, status=${response.statusCode ?? 'n/a'})`
      );
      this.applyServerResponse(row, response);
      return true;
    }
    // processing (a retry is in flight), processed/rejected (already settled), or
    // queued/nacked — the outcome is owned elsewhere; don't double-apply.
    this.log.warn(
      `Discarding server response for row id=${row.id} in state '${row.state}' (callback=${response.callback})`
    );
    return false;
  }

  /**
   * Stops the dispatch loop. Cancels any in-flight dispatch by rejecting its
   * pending response Promise with `worker-stopped` — an ambiguous outcome (we
   * don't know whether the server processed the message). Because `worker-stopped`
   * is an ambiguous code, normal channels leave the row `failed` for operator
   * review (never silently re-dispatched); guaranteed-delivery channels schedule
   * a retry so the row resumes after restart.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.stopping = true;
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
   * pending dispatch alone and let the response timeout route it through
   * {@link handleFailure} (review-only in normal mode, retried under guaranteed).
   */
  onWebSocketDisconnect(): void {
    const pending = this.pending;
    if (!pending) {
      return;
    }
    if (!this.app.removeUnsentTransmit(pending.row.callbackId)) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending = undefined;
    this.queue.requeue(pending.row.id);
    this.log.info(
      `Row id=${pending.row.id} (control id=${pending.row.msgControlId ?? 'n/a'}) requeued: WebSocket disconnected before transmit was sent`
    );
    pending.reject(new RowRequeuedError());
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      // Don't claim while the server connection is down — a dispatch started
      // now would only sit in the in-memory WS queue until the response timer
      // errored it. Rows stay durably `queued` and drain on reconnect (§9);
      // app.ts notifies us when the connection comes back.
      if (!this.app.isLive()) {
        await this.waitForWork();
        continue;
      }
      const row = this.queue.claimNext(this.channelName);
      if (!row) {
        await this.waitForWork();
        continue;
      }
      await this.process(row);
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
      // truth, not the HTTP status. AA/CA → accepted (fall through to success);
      // AR/CR → definitive reject (terminal `rejected`); AE/CE or any failure
      // without a parseable AA/CA → keep retrying until upstream answers
      // definitively. This deliberately retries the ambiguous codes too — the
      // duplication risk the operator opted into by enabling guaranteedDelivery.
      const ackCode = parseAckCode(response.body);
      if (ackCode === 'AR' || ackCode === 'CR') {
        this.handleFailure(
          row,
          QueueErrorCode.UpstreamRejected,
          `Upstream rejected the message (${ackCode}): ${response.body ?? ''}`
        );
        return;
      }
      if (ackCode === 'AE' || ackCode === 'CE') {
        this.handleFailure(
          row,
          QueueErrorCode.UpstreamError,
          `Upstream returned an error ACK (${ackCode}): ${response.body ?? ''}`
        );
        return;
      }
      if (ackCode !== 'AA' && ackCode !== 'CA' && statusCode >= 400) {
        this.handleFailure(
          row,
          classifyStatusCode(statusCode),
          `Server returned ${statusCode}: ${response.body ?? ''}`
        );
        return;
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
    let ackOk = false;
    let ackError: unknown;
    try {
      ackOk = this.sendAck(response, row);
    } catch (err) {
      ackError = err;
    }
    this.queue.markProcessed(row.id, ackOk ? AckOutcome.DELIVERED : AckOutcome.UNDELIVERED);
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
   * @param row - The row that failed; `attemptCount` reflects the attempt that just failed.
   * @param code - Classification attached at the failure site.
   * @param message - Human-readable error, written to `last_error` either way.
   */
  private handleFailure(row: InboundRow, code: QueueErrorCode, message: string): void {
    const rowDesc = `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'})`;
    const policy = this.retryPolicy;
    const retryable = policy.guaranteedDelivery
      ? !GUARANTEED_TERMINAL_CODES.has(code)
      : RETRYABLE_ERROR_CODES.has(code);
    if (policy.enabled && retryable) {
      const attemptsRemain = policy.maxAttempts === 0 || row.attemptCount < policy.maxAttempts;
      if (attemptsRemain) {
        const delayMs = computeRetryDelayMs(policy, row.attemptCount);
        if (this.queue.scheduleRetry(row.id, message, code, Date.now() + delayMs)) {
          const attemptDesc = `attempt ${row.attemptCount + 1}${policy.maxAttempts > 0 ? `/${policy.maxAttempts}` : ''}`;
          this.log.warn(`${rowDesc} failed (${code}), retrying in ${delayMs}ms (${attemptDesc}): ${message}`);
          return;
        }
        // Row was no longer in `processing` (e.g. raced with shutdown recovery) —
        // fall through to the terminal transition, which is a no-op for the same reason.
      } else {
        message = `${message} (${row.attemptCount} attempts exhausted)`;
      }
    }
    // Not retried (or exhausted): land on the terminal state by classification.
    if (PERMANENT_ERROR_CODES.has(code)) {
      this.queue.markRejected(row.id, message, code);
      this.log.error(`${rowDesc} rejected (${code}): ${message}`);
    } else {
      // Transient/ambiguous codes the policy isn't retrying — left for operator review.
      this.queue.markFailed(row.id, message, code);
      this.log.error(`${rowDesc} failed (${code}, operator review): ${message}`);
    }
  }

  private async dispatch(row: InboundRow): Promise<AgentTransmitResponse> {
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
      this.pending = { row, resolve, reject, timeout };

      this.app.addToWebSocketQueue({
        type: 'agent:transmit:request',
        accessToken: 'placeholder',
        channel: row.channelName,
        remote: row.remote,
        contentType: ContentType.HL7_V2,
        body: row.finalizedMessage.toString(row.encoding ? toBufferEncoding(row.encoding) : 'utf8'),
        callback: row.callbackId,
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
 * @returns The uppercased MSA-1 value (e.g. 'AA', 'AE', 'AR', 'CA', 'CE', 'CR'), or undefined.
 */
function parseAckCode(body: string | undefined): string | undefined {
  if (!body) {
    return undefined;
  }
  try {
    return Hl7Message.parse(body).getSegment('MSA')?.getField(1)?.toString()?.toUpperCase() || undefined;
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

/**
 * Translates an HL7 encoding query-param value into the BufferEncoding used by
 * `Buffer.toString`. The agent stores the raw bytes; for forwarding upstream we
 * decode using the channel's configured encoding. The fallback is `utf8`.
 *
 * Only encodings Node's built-in Buffer understands are honored here — anything
 * else (e.g. an iconv-only encoding) falls back to utf8 to avoid throwing.
 * The wire-truth blob is preserved in `body` regardless.
 * @param encoding - The encoding string as recorded on the row (matches the channel URL param).
 * @returns A `BufferEncoding` value safe to pass to `Buffer.toString()`.
 */
function toBufferEncoding(encoding: string): BufferEncoding {
  const normalized = encoding.toLowerCase().replace(/[-_]/g, '');
  switch (normalized) {
    case 'utf8':
    case 'utf':
      return 'utf8';
    case 'utf16le':
    case 'ucs2':
      return 'utf16le';
    case 'latin1':
    case 'iso88591':
    case 'binary':
      return 'latin1';
    case 'ascii':
      return 'ascii';
    case 'base64':
      return 'base64';
    case 'hex':
      return 'hex';
    default:
      return 'utf8';
  }
}
