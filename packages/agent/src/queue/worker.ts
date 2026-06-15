// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, normalizeErrorString, sleep } from '@medplum/core';
import type { App } from '../app';
import type { DurableQueue } from './durable-queue';
import type { InboundRow } from './types';
import { AckOutcome, MessageState, QueueError, QueueErrorCode } from './types';

/**
 * Maximum time we wait for the Medplum server to respond to an
 * `agent:transmit:request` before timing out and marking the row errored.
 */
export const DEFAULT_WORKER_RESPONSE_TIMEOUT_MS = 60_000;

/** Polling delay when the queue is empty (in addition to wake-on-notify). */
export const DEFAULT_WORKER_IDLE_POLL_MS = 250;

export interface ChannelQueueWorkerOptions {
  channelName: string;
  app: App;
  queue: DurableQueue;
  log: ILogger;
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
    this.wakeSignal = makeWakeSignal();
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
    if (pending?.row.callbackId === response.callback) {
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
   * don't know whether the server processed the message). The row is marked
   * `failed` for operator review; an operator decides whether to replay.
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
   * pending dispatch alone and let the response timeout mark it `errored`.
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
      if (row) {
        await this.process(row);
      }

      await this.waitForWork();
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
      // transient/ambiguous — never a rejection of the message — so it lands in
      // `failed`, the retry/review bucket.
      const code = err instanceof QueueError ? err.code : QueueErrorCode.DispatchFailed;
      const msg = normalizeErrorString(err);
      this.queue.markFailed(row.id, msg, code);
      this.log.error(
        `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) failed during dispatch (${code}): ${msg}`
      );
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
    if (statusCode >= 400) {
      const msg = `Server returned ${statusCode}: ${response.body ?? ''}`;
      const code = classifyStatusCode(statusCode);
      // A permanent 4xx means the Bot rejected the message itself (`rejected`,
      // never retried); 5xx / 429 is a transient Bot-leg failure (`failed`).
      if (code === QueueErrorCode.ServerRejected) {
        this.queue.markRejected(row.id, msg, code);
      } else {
        this.queue.markFailed(row.id, msg, code);
      }
      this.log.warn(`Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) ${code}: ${msg}`);
      return;
    }

    // The Bot accepted the message (2xx): the row is `processed`. Delivering the
    // ACK back to the source is a SEPARATE leg recorded in ack_outcome — a closed
    // source connection yields `processed` + `undelivered`, never a Bot-leg
    // failure, and is therefore never re-dispatched. The source recovers it by
    // retransmitting, which replays the stored ACK (handleDuplicate, hl7.ts).

    // In aaMode the deferred-commit ACK already sent the source an `AA` at intake
    // (hl7.ts handleMessageDurable → sendCommitAck), and aaMode's contract is
    // "send AA immediately, then ignore any later app-level ACKs" (hl7 connection).
    // The Bot's app-level AA would therefore be a redundant *second* AA the source
    // is no longer listening for — a source that closes its connection on ACK has
    // already torn the socket down, producing spurious "disconnected remote" /
    // "ACK delivery failed" warnings. Suppress the second send; the source was
    // already acknowledged, so the outcome is a successful no-op (DELIVERED), the
    // same convention used for policy-suppressed sends.
    if (row.enhancedMode === 'aaMode') {
      this.queue.markProcessed(row.id, AckOutcome.DELIVERED);
      this.log.debug(
        `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) processed; app-level AA suppressed (aaMode commit ACK already acknowledged the source)`
      );
      return;
    }

    let ackOk = false;
    let ackError: unknown;
    try {
      ackOk = this.sendAck(response, row);
    } catch (err) {
      ackError = err;
    }
    this.queue.markProcessed(row.id, ackOk ? AckOutcome.DELIVERED : AckOutcome.UNDELIVERED);
    if (!ackOk) {
      const detail = ackError ? `: ${normalizeErrorString(ackError)}` : '';
      this.log.warn(
        `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) processed upstream but ACK delivery to source failed${detail}; awaiting source retransmit to replay`
      );
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
        // finalizedMessage holds the decoded HL7 text stored as UTF-8 at intake
        // (see AgentHl7ChannelConnection.handleMessage) — the same body the legacy
        // path forwards. The channel `encoding` is wire-level only and recorded
        // on the row for reference; it does not affect the forwarded text.
        body: row.finalizedMessage.toString('utf8'),
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

function makeWakeSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
