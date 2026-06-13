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
import { MessageState, QueueErrorCode } from './types';
import { ChannelQueueWorker } from './worker';

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
    body: Buffer.from(body),
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

  test('server >= 400 marks the row errored and proceeds to the next', async () => {
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
    });
    worker.start();

    await waitFor(() => worker.hasInFlight() && r1.callbackId === lastCallback(worker));
    worker.onServerResponse(makeResponse(r1.callbackId, 503, 'service down'));

    await waitFor(() => queue.getById(r1.id)?.state === MessageState.ERRORED);
    expect(queue.getById(r1.id)?.lastError).toContain('503');
    expect(queue.getById(r1.id)?.errorCode).toBe(QueueErrorCode.ServerError);

    await waitFor(() => worker.hasInFlight() && r2.callbackId === lastCallback(worker));
    worker.onServerResponse(makeResponse(r2.callbackId, 200));
    await waitFor(() => queue.getById(r2.id)?.state === MessageState.PROCESSED);

    await worker.stop();
  });

  test('sendAck returning false marks the row errored', async () => {
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
    await waitFor(() => queue.getById(r.id)?.state === MessageState.ERRORED);
    expect(queue.getById(r.id)?.lastError).toContain('ACK delivery');
    expect(queue.getById(r.id)?.errorCode).toBe(QueueErrorCode.AckDeliveryFailed);
    await worker.stop();
  });

  test('sendAck throwing marks the row errored without crashing the loop', async () => {
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
    await waitFor(() => queue.getById(r1.id)?.state === MessageState.ERRORED);
    expect(queue.getById(r1.id)?.lastError).toContain('socket gone');
    expect(queue.getById(r1.id)?.errorCode).toBe(QueueErrorCode.AckDeliveryFailed);

    await waitFor(() => worker.hasInFlight());
    worker.onServerResponse(makeResponse(r2.callbackId, 200));
    await waitFor(() => queue.getById(r2.id)?.state === MessageState.PROCESSED);
    await worker.stop();
  });

  test('response timeout marks the row errored', async () => {
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
    await waitFor(() => queue.getById(r.id)?.state === MessageState.ERRORED, 2000);
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

    // Ambiguous delivery — the worker must not requeue; the timeout errors it.
    expect(worker.hasInFlight()).toBe(true);
    await waitFor(() => queue.getById(r.id)?.state === MessageState.ERRORED, 2000);
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
