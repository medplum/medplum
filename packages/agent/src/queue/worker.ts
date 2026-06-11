// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentTransmitResponse, ILogger } from '@medplum/core';
import { ContentType, normalizeErrorString, sleep } from '@medplum/core';
import type { App } from '../app';
import type { DurableQueue } from './durable-queue';
import type { InboundRow } from './types';

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
   * Returning `false` signals delivery failure (e.g. socket closed) — the row
   * goes to `errored`.
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
   * Routes a server `agent:transmit:response` to its pending in-flight row, if any.
   * @param response - The response message received over the WS.
   * @returns True if the response was claimed by this worker; false if no row
   *          matched (caller should fall through to legacy handling).
   */
  onServerResponse(response: AgentTransmitResponse): boolean {
    if (!response.callback) {
      return false;
    }
    if (this.pending?.row.callbackId !== response.callback) {
      return false;
    }
    const pending = this.pending;
    clearTimeout(pending.timeout);
    this.pending = undefined;
    pending.resolve(response);
    return true;
  }

  /**
   * Stops the dispatch loop. Cancels any in-flight dispatch by rejecting its
   * pending response Promise; the row stays in `processing` and will be
   * promoted to `errored` by {@link DurableQueue.recoverOnStartup} on the
   * next startup. That's the right semantic — we don't know whether the
   * server actually processed the message, so an operator has to decide
   * whether to replay.
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
      pending.reject(new Error('worker stopping'));
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
   * `queued` so it retries on reconnect instead of timing out into `errored`.
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
      this.queue.markErrored(row.id, normalizeErrorString(err));
      this.log.error(
        `Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) errored during dispatch: ${normalizeErrorString(err)}`
      );
      return;
    }

    this.queue.recordServerResponse(row.id, response.statusCode ?? null, response.body ?? null);

    const statusCode = response.statusCode ?? 0;
    if (statusCode >= 400) {
      const msg = `Server returned ${statusCode}: ${response.body ?? ''}`;
      this.queue.markErrored(row.id, msg);
      this.log.warn(`Row id=${row.id} (control id=${row.msgControlId ?? 'n/a'}) errored: ${msg}`);
      return;
    }

    let ackOk = false;
    try {
      ackOk = this.sendAck(response, row);
    } catch (err) {
      this.queue.markErrored(row.id, `ACK delivery threw: ${normalizeErrorString(err)}`);
      return;
    }

    if (!ackOk) {
      this.queue.markErrored(row.id, 'ACK delivery to source failed');
      return;
    }

    this.queue.markProcessed(row.id);
  }

  private async dispatch(row: InboundRow): Promise<AgentTransmitResponse> {
    return new Promise<AgentTransmitResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending?.row.id === row.id) {
          this.pending = undefined;
        }
        reject(new Error(`Timed out after ${this.responseTimeoutMs}ms waiting for server response`));
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
        body: row.body.toString(row.encoding ? toBufferEncoding(row.encoding) : 'utf8'),
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
