// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { AgentMessage, AgentTransmitResponse } from '@medplum/core';
import { ContentType } from '@medplum/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { App } from '../app';
import { createMockLogger } from '../test-utils';
import { DurableQueue } from './durable-queue';
import type { InboundRow } from './types';
import { AckOutcome, MessageState, QueueErrorCode } from './types';
import type { RetryPolicy } from './worker';
import { ChannelQueueWorker, computeRetryDelayMs, DEFAULT_RETRY_POLICY } from './worker';

/**
 * Stub App used by worker tests. Only the surface the worker touches is implemented;
 * everything else is intentionally absent so a slipped dependency surfaces as a clear
 * runtime error rather than silent behavior.
 *
 * `sent` plays the role of the real App's `webSocketQueue`: messages the stub has
 * accepted but (since the stub never sends) that remain "unsent" for the purposes
 * of `removeUnsentTransmit`. Tests that need to simulate a request that already
 * went out on the wire can clear/splice `sent` directly.
 * @param options - Stub options.
 * @param options.live - Initial `live` state (defaults to true).
 * @returns A minimal App stub, the captured WS messages, and a setter for the live flag.
 */
function makeStubApp(options?: { live?: boolean }): {
  app: App;
  sent: AgentMessage[];
  setLive: (live: boolean) => void;
} {
  const sent: AgentMessage[] = [];
  let live = options?.live ?? true;
  const stub = {
    agentId: 'agent-test',
    isLive: () => live,
    addToWebSocketQueue: (msg: AgentMessage) => {
      sent.push(msg);
    },
    removeUnsentTransmit: (callbackId: string) => {
      const index = sent.findIndex((msg) => msg.type === 'agent:transmit:request' && msg.callback === callbackId);
      if (index === -1) {
        return false;
      }
      sent.splice(index, 1);
      return true;
    },
  };
  return {
    app: stub as unknown as App,
    sent,
    setLive: (value: boolean) => {
      live = value;
    },
  };
}

function enqueueOne(queue: DurableQueue, callbackId: string, body: string = 'MSH|^~\\&|...|2.5\r'): InboundRow {
  const r = queue.enqueue({
    channelName: 'ch1',
    remote: '127.0.0.1:5000',
    msgControlId: callbackId,
    msgType: 'ADT^A01',
    originalMessage: Buffer.from(body),
    finalizedMessage: Buffer.from(body),
    encoding: 'utf-8',
    enhancedMode: 'standard',
    callbackId,
    seqNo: null,
    receivedAt: Date.now(),
  });
  if (r.kind !== 'inserted') {
    throw new Error('expected inserted');
  }
  return r.row;
}

function makeResponse(callback: string, statusCode: number, body: string = 'MSH|...\rMSA|AA|x'): AgentTransmitResponse {
  return {
    type: 'agent:transmit:response',
    channel: 'ch1',
    remote: '127.0.0.1:5000',
    callback,
    contentType: ContentType.HL7_V2,
    statusCode,
    body,
  };
}

describe('ChannelQueueWorker', () => {
  let dir: string;
  let queue: DurableQueue;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wq-test-'));
    queue = DurableQueue.open({ path: join(dir, 'queue.sqlite'), log: createMockLogger() });
  });

  afterEach(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('processes queued rows in FIFO order with successful end-to-end ACK', async () => {
    const rows = ['M1', 'M2', 'M3', 'M4', 'M5'].map((id) => enqueueOne(queue, id));
    const { app, sent } = makeStubApp();
    const sendAck = vi.fn(() => true);

    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck,
      responseTimeoutMs: 5000,
      idlePollMs: 10,
    });
    worker.start();

    // The worker dispatches one row at a time; satisfy each in order.
    for (const row of rows) {
      await waitFor(() => sent.length >= 1 && (sent.at(-1) as { callback?: string }).callback === row.callbackId);
      worker.onServerResponse(makeResponse(row.callbackId, 200));
      // Let the worker finish processing this row before the next dispatch.
      await waitFor(() => queue.getById(row.id)?.state === MessageState.PROCESSED);
    }

    expect(sendAck).toHaveBeenCalledTimes(5);
    expect(sent).toHaveLength(5);
    for (const row of rows) {
      expect(queue.getById(row.id)?.state).toBe(MessageState.PROCESSED);
    }
    await worker.stop();
  });

  test('server 5xx with auto-retry opted out marks the row failed (transient) and proceeds to the next', async () => {
    const r1 = enqueueOne(queue, 'E1');
    const r2 = enqueueOne(queue, 'E2');
    const { app } = makeStubApp();

    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      idlePollMs: 10,
      // Auto-retry defaults to ON; this test covers the explicit opt-out path.
      retryPolicy: { ...DEFAULT_RETRY_POLICY, enabled: false },
    });
    worker.start();

    await waitFor(() => worker.hasInFlight() && r1.callbackId === lastCallback(worker));
    worker.onServerResponse(makeResponse(r1.callbackId, 503, 'service down'));

    await waitFor(() => queue.getById(r1.id)?.state === MessageState.FAILED);
    expect(queue.getById(r1.id)?.lastError).toContain('503');
    expect(queue.getById(r1.id)?.errorCode).toBe(QueueErrorCode.ServerError);
    // 5xx is a Bot-leg failure → no source ACK is owed.
    expect(queue.getById(r1.id)?.ackOutcome).toBe(AckOutcome.NOT_OWED);

    await waitFor(() => worker.hasInFlight() && r2.callbackId === lastCallback(worker));
    worker.onServerResponse(makeResponse(r2.callbackId, 200));
    await waitFor(() => queue.getById(r2.id)?.state === MessageState.PROCESSED);

    await worker.stop();
  });

  test('server 4xx marks the row rejected (permanent), 429 is the transient exception', async () => {
    const r1 = enqueueOne(queue, 'RJ1');
    const r2 = enqueueOne(queue, 'RJ2');
    const { app } = makeStubApp();

    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      idlePollMs: 10,
      // Auto-retry off so we observe the terminal classification directly: a
      // transient 429 would otherwise be re-queued for retry, not left `failed`.
      retryPolicy: { ...DEFAULT_RETRY_POLICY, enabled: false },
    });
    worker.start();

    await waitFor(() => worker.hasInFlight() && r1.callbackId === lastCallback(worker));
    worker.onServerResponse(makeResponse(r1.callbackId, 422, 'bad message'));

    await waitFor(() => queue.getById(r1.id)?.state === MessageState.REJECTED);
    expect(queue.getById(r1.id)?.errorCode).toBe(QueueErrorCode.ServerRejected);
    expect(queue.getById(r1.id)?.ackOutcome).toBe(AckOutcome.NOT_OWED);

    // 429 is the one 4xx that's transient → failed, not rejected.
    await waitFor(() => worker.hasInFlight() && r2.callbackId === lastCallback(worker));
    worker.onServerResponse(makeResponse(r2.callbackId, 429, 'slow down'));
    await waitFor(() => queue.getById(r2.id)?.state === MessageState.FAILED);
    expect(queue.getById(r2.id)?.errorCode).toBe(QueueErrorCode.ServerRateLimited);

    await worker.stop();
  });

  test('sendAck returning false leaves the row processed with ack_outcome=undelivered', async () => {
    const r = enqueueOne(queue, 'A1');
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => false,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(r.callbackId, 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    // The Bot accepted it (processed); only the source-leg ACK failed. No Bot-leg
    // error code is set — a closed source connection is never an upstream failure.
    expect(queue.getById(r.id)?.ackOutcome).toBe(AckOutcome.UNDELIVERED);
    expect(queue.getById(r.id)?.errorCode).toBeNull();
    await worker.stop();
  });

  test('sendAck throwing leaves the row processed+undelivered without crashing the loop', async () => {
    const r1 = enqueueOne(queue, 'T1');
    const r2 = enqueueOne(queue, 'T2');
    const { app } = makeStubApp();
    let throwOnce = true;
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => {
        if (throwOnce) {
          throwOnce = false;
          throw new Error('socket gone');
        }
        return true;
      },
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(r1.callbackId, 200));
    await waitFor(() => queue.getById(r1.id)?.state === MessageState.PROCESSED);
    expect(queue.getById(r1.id)?.ackOutcome).toBe(AckOutcome.UNDELIVERED);
    expect(queue.getById(r1.id)?.errorCode).toBeNull();

    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(r2.callbackId, 200));
    await waitFor(() => queue.getById(r2.id)?.state === MessageState.PROCESSED);
    expect(queue.getById(r2.id)?.ackOutcome).toBe(AckOutcome.DELIVERED);
    await worker.stop();
  });

  test('response timeout marks the row failed', async () => {
    const r = enqueueOne(queue, 'TIMEOUT');
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 50,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => queue.getById(r.id)?.state === MessageState.FAILED, 2000);
    expect(queue.getById(r.id)?.lastError).toContain('Timed out');
    expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ResponseTimeout);
    await worker.stop();
  });

  test('onServerResponse for an unknown callback returns false', () => {
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
    });
    expect(
      worker.onServerResponse({
        type: 'agent:transmit:response',
        channel: 'ch1',
        remote: 'r',
        callback: 'nope',
        contentType: ContentType.HL7_V2,
        statusCode: 200,
        body: '',
      })
    ).toBe(false);
  });

  test('stop drains and prevents further claims', async () => {
    const r = enqueueOne(queue, 'STOP1');
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(r.callbackId, 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);

    await worker.stop();

    // Enqueue more after stop — they should NOT be claimed since the loop exited.
    enqueueOne(queue, 'STOP2');
    // Give the loop a chance to wake (it won't — stop set the flag).
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(queue.countByState().queued).toBe(1);
  });

  test('rows stay queued while the WebSocket is not live, then drain on reconnect', async () => {
    const r = enqueueOne(queue, 'OFFLINE1');
    const { app, sent, setLive } = makeStubApp({ live: false });
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 100,
      idlePollMs: 10,
    });
    worker.start();

    // Give the loop several ticks — nothing should be claimed or dispatched,
    // and crucially nothing should time out into `errored`.
    await sleepMs(100);
    expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);
    expect(queue.getById(r.id)?.attemptCount).toBe(0);
    expect(sent).toHaveLength(0);
    expect(worker.hasInFlight()).toBe(false);

    // Reconnect: the row dispatches and completes normally.
    setLive(true);
    worker.notify();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(r.callbackId, 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    await worker.stop();
  });

  test('disconnect with the transmit request still unsent requeues the row', async () => {
    const r = enqueueOne(queue, 'REQUEUE1');
    const { app, setLive } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 100,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());
    expect(queue.getById(r.id)?.state).toBe(MessageState.PROCESSING);

    // Connection drops before the request left the WS queue.
    setLive(false);
    worker.onWebSocketDisconnect();

    expect(worker.hasInFlight()).toBe(false);
    expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);
    // The dispatch never left the process, so it doesn't count as an attempt.
    expect(queue.getById(r.id)?.attemptCount).toBe(0);

    // Outlive the original response timeout — the row must NOT become errored.
    await sleepMs(150);
    expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);

    // Reconnect: the same row is re-claimed and completes.
    setLive(true);
    worker.notify();
    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(r.callbackId, 200));
    await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
    await worker.stop();
  });

  test('disconnect after the transmit request was sent leaves the row to the response timeout', async () => {
    const r = enqueueOne(queue, 'SENT1');
    const { app, sent, setLive } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
      responseTimeoutMs: 50,
      idlePollMs: 10,
    });
    worker.start();
    await waitFor(() => worker.hasInFlight());

    // Simulate the request having gone out on the wire: it's no longer in the
    // WS queue, so removeUnsentTransmit can't find it.
    sent.length = 0;
    setLive(false);
    worker.onWebSocketDisconnect();

    // Ambiguous delivery — the worker must not requeue; the timeout fails it.
    expect(worker.hasInFlight()).toBe(true);
    await waitFor(() => queue.getById(r.id)?.state === MessageState.FAILED, 2000);
    expect(queue.getById(r.id)?.lastError).toContain('Timed out');
    expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ResponseTimeout);
    await worker.stop();
  });

  test('onWebSocketDisconnect with nothing in flight is a no-op', () => {
    const { app } = makeStubApp();
    const worker = new ChannelQueueWorker({
      channelName: 'ch1',
      app,
      queue,
      log: createMockLogger(),
      sendAck: () => true,
    });
    expect(() => worker.onWebSocketDisconnect()).not.toThrow();
  });

  describe('auto-retry', () => {
    // Multiplier 1 keeps every backoff at baseDelayMs so test timing stays flat.
    const fastRetryPolicy: RetryPolicy = {
      enabled: true,
      guaranteedDelivery: false,
      baseDelayMs: 20,
      maxDelayMs: 100,
      maxAttempts: 3,
      backoffMultiplier: 1,
    };

    function makeWorker(app: App, sendAck: () => boolean, policy?: Partial<RetryPolicy>): ChannelQueueWorker {
      return new ChannelQueueWorker({
        channelName: 'ch1',
        app,
        queue,
        log: createMockLogger(),
        sendAck,
        responseTimeoutMs: 5000,
        idlePollMs: 10,
        retryPolicy: { ...fastRetryPolicy, ...policy },
      });
    }

    test('server 5xx schedules a retry and the row succeeds on the next attempt', async () => {
      const r = enqueueOne(queue, 'RETRY1');
      const { app } = makeStubApp();
      const worker = makeWorker(app, () => true);
      worker.start();

      await waitFor(() => worker.hasInFlight());
      const before = Date.now();
      worker.onServerResponse(makeResponse(r.callbackId, 503, 'service down'));

      // The row returns to queued (not errored) with retry metadata.
      await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);
      const scheduled = queue.getById(r.id);
      expect(scheduled?.errorCode).toBe(QueueErrorCode.ServerError);
      expect(scheduled?.lastError).toContain('503');
      expect(scheduled?.nextAttemptAt).toBeGreaterThanOrEqual(before + fastRetryPolicy.baseDelayMs);

      // After the backoff, the worker re-claims the same row; succeed it.
      await waitFor(() => worker.hasInFlight(), 2000);
      worker.onServerResponse(makeResponse(r.callbackId, 200));
      await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
      expect(queue.getById(r.id)?.attemptCount).toBe(2);
      await worker.stop();
    });

    test('429 is retryable; other 4xx is terminal with server-rejected', async () => {
      const r429 = enqueueOne(queue, 'RL1');
      const r400 = enqueueOne(queue, 'BAD1');
      const { app } = makeStubApp();
      const worker = makeWorker(app, () => true);
      worker.start();

      await waitFor(() => worker.hasInFlight() && lastCallback(worker) === r429.callbackId);
      worker.onServerResponse(makeResponse(r429.callbackId, 429, 'slow down'));
      await waitFor(() => queue.getById(r429.id)?.state === MessageState.QUEUED);
      expect(queue.getById(r429.id)?.errorCode).toBe(QueueErrorCode.ServerRateLimited);

      // The retrying row blocks the channel head-of-line; satisfy it first.
      await waitFor(() => worker.hasInFlight() && lastCallback(worker) === r429.callbackId, 2000);
      worker.onServerResponse(makeResponse(r429.callbackId, 200));
      await waitFor(() => queue.getById(r429.id)?.state === MessageState.PROCESSED);

      // A non-429 4xx never retries, even with the policy enabled — it's a
      // permanent reject (`rejected`), not the retry/review `failed` bucket.
      await waitFor(() => worker.hasInFlight() && lastCallback(worker) === r400.callbackId, 2000);
      worker.onServerResponse(makeResponse(r400.callbackId, 400, 'bad message'));
      await waitFor(() => queue.getById(r400.id)?.state === MessageState.REJECTED);
      expect(queue.getById(r400.id)?.errorCode).toBe(QueueErrorCode.ServerRejected);
      await worker.stop();
    });

    test('a retryable failure becomes terminal once maxAttempts is exhausted', async () => {
      const r = enqueueOne(queue, 'EXHAUST1');
      const { app } = makeStubApp();
      const worker = makeWorker(app, () => true, { maxAttempts: 2 });
      worker.start();

      for (let attempt = 1; attempt <= 2; attempt++) {
        await waitFor(() => worker.hasInFlight(), 2000);
        worker.onServerResponse(makeResponse(r.callbackId, 503, 'still down'));
        await waitFor(() => queue.getById(r.id)?.state !== MessageState.PROCESSING);
      }

      const final = queue.getById(r.id);
      // ServerError is transient, not permanent — exhausted retries land in `failed`
      // (the review bucket), never `rejected`.
      expect(final?.state).toBe(MessageState.FAILED);
      expect(final?.attemptCount).toBe(2);
      expect(final?.errorCode).toBe(QueueErrorCode.ServerError);
      expect(final?.lastError).toContain('2 attempts exhausted');
      await worker.stop();
    });

    test('an ambiguous response timeout is NOT retried in normal mode — left failed for review', async () => {
      const r = enqueueOne(queue, 'AMBIG1');
      const { app } = makeStubApp();
      const worker = new ChannelQueueWorker({
        channelName: 'ch1',
        app,
        queue,
        log: createMockLogger(),
        sendAck: () => true,
        responseTimeoutMs: 50,
        idlePollMs: 10,
        retryPolicy: fastRetryPolicy,
      });
      worker.start();
      // The timeout is an ambiguous failure: the server may have processed the
      // message, so even with auto-retry enabled it must NOT be re-dispatched —
      // it lands in `failed` for an operator to decide. This is the core of the
      // transient-vs-ambiguous gating.
      await waitFor(() => queue.getById(r.id)?.state === MessageState.FAILED, 2000);
      expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ResponseTimeout);
      expect(queue.getById(r.id)?.attemptCount).toBe(1);
      await worker.stop();
    });

    describe('guaranteed delivery', () => {
      const guaranteedPolicy: RetryPolicy = { ...fastRetryPolicy, guaranteedDelivery: true, maxAttempts: 0 };

      function makeAckBody(ackCode: string, controlId: string = 'X1'): string {
        return `MSH|^~\\&|MEDPLUM|MEDPLUM|TEST|TEST|20240101000000||ACK|${controlId}|P|2.5.1\rMSA|${ackCode}|${controlId}`;
      }

      test('response timeout is retried until upstream answers', async () => {
        const r = enqueueOne(queue, 'GD-TIMEOUT');
        const { app } = makeStubApp();
        const worker = new ChannelQueueWorker({
          channelName: 'ch1',
          app,
          queue,
          log: createMockLogger(),
          sendAck: () => true,
          responseTimeoutMs: 50,
          idlePollMs: 10,
          retryPolicy: guaranteedPolicy,
        });
        worker.start();

        // The first dispatch times out — ambiguous, but guaranteed mode retries it.
        await waitFor(() => queue.getById(r.id)?.errorCode === QueueErrorCode.ResponseTimeout, 2000);
        expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);

        // Answer the next dispatch definitively.
        await waitFor(() => worker.hasInFlight(), 2000);
        worker.onServerResponse(makeResponse(r.callbackId, 200, makeAckBody('AA')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
        await worker.stop();
      });

      test('HTTP 4xx without a definitive ACK is retried', async () => {
        const r = enqueueOne(queue, 'GD-400');
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => true, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        worker.onServerResponse(makeResponse(r.callbackId, 400, 'not an hl7 ack'));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);
        expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ServerRejected);

        await waitFor(() => worker.hasInFlight(), 2000);
        worker.onServerResponse(makeResponse(r.callbackId, 200, makeAckBody('AA')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
        expect(queue.getById(r.id)?.attemptCount).toBe(2);
        await worker.stop();
      });

      test.each(['AR', 'CR'])('upstream %s is a definitive reject — terminal, no retry', async (ackCode) => {
        const r = enqueueOne(queue, `GD-${ackCode}`);
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => true, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        worker.onServerResponse(makeResponse(r.callbackId, 400, makeAckBody(ackCode)));
        // A definitive upstream reject is permanent → `rejected`, never retried.
        await waitFor(() => queue.getById(r.id)?.state === MessageState.REJECTED);
        expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.UpstreamRejected);
        expect(queue.getById(r.id)?.attemptCount).toBe(1);
        await worker.stop();
      });

      test('upstream AE retries until a definitive AA arrives', async () => {
        const r = enqueueOne(queue, 'GD-AE');
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => true, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        worker.onServerResponse(makeResponse(r.callbackId, 200, makeAckBody('AE')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);
        expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.UpstreamError);

        await waitFor(() => worker.hasInFlight(), 2000);
        worker.onServerResponse(makeResponse(r.callbackId, 200, makeAckBody('AA')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
        await worker.stop();
      });

      test('source ACK failure is processed+undelivered, never re-dispatched — even under guaranteed delivery', async () => {
        // Guaranteed delivery retries Bot-leg failures, but a failed SOURCE ACK is
        // not a Bot-leg failure: upstream already accepted the message (AA). The
        // row settles `processed` + `undelivered` and is never re-dispatched (that
        // would double-process); it recovers via a source retransmit (Path-1).
        const r = enqueueOne(queue, 'GD-ACKFAIL');
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => false, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        worker.onServerResponse(makeResponse(r.callbackId, 200, makeAckBody('AA')));
        await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
        expect(queue.getById(r.id)?.ackOutcome).toBe(AckOutcome.UNDELIVERED);
        expect(queue.getById(r.id)?.errorCode).toBeNull();
        expect(queue.getById(r.id)?.attemptCount).toBe(1);
        await worker.stop();
      });

      test('worker stop schedules a retry instead of erroring the in-flight row', async () => {
        const r = enqueueOne(queue, 'GD-STOP');
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => true, { guaranteedDelivery: true, maxAttempts: 0 });
        worker.start();

        await waitFor(() => worker.hasInFlight());
        await worker.stop();

        expect(queue.getById(r.id)?.state).toBe(MessageState.QUEUED);
        expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.WorkerStopped);
      });

      test('explicit maxAttempts caps guaranteed-mode retries', async () => {
        const r = enqueueOne(queue, 'GD-CAP');
        const { app } = makeStubApp();
        const worker = makeWorker(app, () => true, { guaranteedDelivery: true, maxAttempts: 2 });
        worker.start();

        for (let attempt = 1; attempt <= 2; attempt++) {
          await waitFor(() => worker.hasInFlight(), 2000);
          worker.onServerResponse(makeResponse(r.callbackId, 200, makeAckBody('AE')));
          await waitFor(() => queue.getById(r.id)?.state !== MessageState.PROCESSING);
        }

        const final = queue.getById(r.id);
        // UpstreamError (AE/CE) is not a permanent reject → exhausted retries land
        // in `failed`, not `rejected`.
        expect(final?.state).toBe(MessageState.FAILED);
        expect(final?.errorCode).toBe(QueueErrorCode.UpstreamError);
        expect(final?.lastError).toContain('2 attempts exhausted');
        await worker.stop();
      });
    });

    test('setRetryPolicy applies to subsequent failures', async () => {
      const r = enqueueOne(queue, 'SWAP1');
      const { app } = makeStubApp();
      const worker = makeWorker(app, () => true, { enabled: false });
      worker.setRetryPolicy(fastRetryPolicy);
      worker.start();

      await waitFor(() => worker.hasInFlight());
      worker.onServerResponse(makeResponse(r.callbackId, 503, 'down'));
      await waitFor(() => queue.getById(r.id)?.state === MessageState.QUEUED);
      expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.ServerError);

      await waitFor(() => worker.hasInFlight(), 2000);
      worker.onServerResponse(makeResponse(r.callbackId, 200));
      await waitFor(() => queue.getById(r.id)?.state === MessageState.PROCESSED);
      await worker.stop();
    });
  });
});

describe('computeRetryDelayMs', () => {
  const policy: RetryPolicy = {
    enabled: true,
    guaranteedDelivery: false,
    baseDelayMs: 1000,
    maxDelayMs: 60_000,
    maxAttempts: 0,
    backoffMultiplier: 2,
  };

  test('grows exponentially from baseDelayMs', () => {
    expect(computeRetryDelayMs(policy, 1)).toBe(1000);
    expect(computeRetryDelayMs(policy, 2)).toBe(2000);
    expect(computeRetryDelayMs(policy, 3)).toBe(4000);
    expect(computeRetryDelayMs(policy, 5)).toBe(16000);
  });

  test('caps at maxDelayMs', () => {
    expect(computeRetryDelayMs(policy, 7)).toBe(60_000);
    expect(computeRetryDelayMs(policy, 50)).toBe(60_000);
  });

  test('multiplier 1 gives a fixed interval', () => {
    const fixed = { ...policy, backoffMultiplier: 1 };
    expect(computeRetryDelayMs(fixed, 1)).toBe(1000);
    expect(computeRetryDelayMs(fixed, 10)).toBe(1000);
  });
});

/**
 * Polls `predicate` until it returns true or `timeoutMs` elapses.
 * Throws a descriptive error on timeout so the test failure points at the assertion.
 * @param predicate - Condition to wait for.
 * @param timeoutMs - Total time to wait before throwing.
 */
async function waitFor(predicate: () => boolean, timeoutMs: number = 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

function lastCallback(worker: ChannelQueueWorker): string | undefined {
  return (worker as unknown as { pending?: { row: InboundRow } }).pending?.row.callbackId;
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
