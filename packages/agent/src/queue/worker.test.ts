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
import { MessageState } from './types';
import { ChannelQueueWorker } from './worker';

/**
 * Stub App used by worker tests. Only the surface the worker touches is implemented;
 * everything else is intentionally absent so a slipped dependency surfaces as a clear
 * runtime error rather than silent behavior.
 * @returns A minimal App stub plus the array of WS messages captured from it.
 */
function makeStubApp(): { app: App; sent: AgentMessage[] } {
  const sent: AgentMessage[] = [];
  const stub = {
    agentId: 'agent-test',
    addToWebSocketQueue: (msg: AgentMessage) => {
      sent.push(msg);
    },
  };
  return { app: stub as unknown as App, sent };
}

function enqueueOne(
  queue: DurableQueue,
  callbackId: string,
  body: string = 'MSH|^~\\&|...|2.5\r'
): InboundRow {
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
    const sendAck = jest.fn(() => true);

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
