// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * End-to-end integration tests for the durable inbound queue.
 *
 * These spin up a full {@link App} (with a mocked Medplum WS server) and a real
 * HL7 client, then drive scenarios from DURABLE_QUEUE_PLAN.md §14.2. The unit
 * tests in `durable-queue.test.ts` / `worker.test.ts` / `retention.test.ts`
 * cover the individual components; this file is about the contract those
 * components implement *together* — specifically, that the durable CA promise
 * is actually honest.
 */

import type { AgentHeartbeatResponse, AgentTransmitResponse } from '@medplum/core';
import { ContentType, Hl7Message, LogLevel, MEDPLUM_VERSION, allOk, createReference, sleep } from '@medplum/core';
import type { Agent, Bot, Endpoint, Resource } from '@medplum/fhirtypes';
import { Hl7Client, ReturnAckCategory } from '@medplum/hl7';
import { MockClient } from '@medplum/mock';
import { Server } from 'mock-socket';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../app';
import { createEndpointWithRandomPort } from '../test-utils';
import { DurableQueue } from './durable-queue';

const medplum = new MockClient();

const BASE_ENDPOINT: Endpoint = {
  resourceType: 'Endpoint',
  status: 'active',
  address: 'mllp://0.0.0.0:0',
  connectionType: { code: ContentType.HL7_V2 },
  payloadType: [{ coding: [{ code: ContentType.HL7_V2 }] }],
};

const TEST_MSG = (controlId: string): Hl7Message =>
  Hl7Message.parse(
    `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|${controlId}|P|2.5\r` +
      'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M\r'
  );

let bot: Bot;

describe('Durable queue integration', () => {
  beforeAll(async () => {
    console.log = jest.fn();
    medplum.router.router.add('POST', ':resourceType/:id/$execute', async () => [allOk, {} as Resource]);
    bot = await medplum.createResource<Bot>({ resourceType: 'Bot' });
  });

  let mockServer: Server;
  let dir: string;

  beforeEach(() => {
    mockServer = new Server('wss://example.com/ws/agent');
    dir = mkdtempSync(join(tmpdir(), 'dq-int-'));
  });

  afterEach(() => {
    mockServer.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Wires up a mock Medplum WS server with a customizable handler for
   * `agent:transmit:request`. The handler decides what to send back for each
   * message (200 OK with an AA, 4xx, no-op, etc.).
   * @param handleTransmit - Callback returning the reply payload (or undefined to skip replying).
   */
  function startMockServer(
    handleTransmit: (cmd: { channel: string; callback: string; remote: string; body: string }) => unknown
  ): void {
    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          return;
        }
        if (command.type === 'agent:heartbeat:request') {
          socket.send(
            Buffer.from(
              JSON.stringify({ type: 'agent:heartbeat:response', version: MEDPLUM_VERSION } satisfies AgentHeartbeatResponse)
            )
          );
          return;
        }
        if (command.type === 'agent:transmit:request') {
          const reply = handleTransmit(command);
          if (reply !== undefined) {
            socket.send(Buffer.from(JSON.stringify(reply)));
          }
        }
      });
    });
  }

  test('happy path: CA is sent after enqueue, row reaches processed', async () => {
    startMockServer((cmd) => {
      // Reply 200 with an AA back to the source
      const ack = Hl7Message.parse(cmd.body).buildAck({ ackCode: 'AA' });
      return {
        type: 'agent:transmit:response',
        channel: cmd.channel,
        remote: cmd.remote,
        callback: cmd.callback,
        contentType: ContentType.HL7_V2,
        statusCode: 200,
        body: ack.toString(),
      } satisfies AgentTransmitResponse;
    });

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [
        { name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) },
      ],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();

    const client = new Hl7Client({ host: 'localhost', port });
    const response = await client.sendAndWait(TEST_MSG('INT_001'), {
      // Resolve on the first ACK — which under enhanced mode is the CA.
      // We want to assert that the deferred CA we sent really hit the wire.
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(response.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    // The worker should have processed the row.
    const queue = app.getDurableQueue() as DurableQueue;
    await waitForRow(queue, (counts) => counts.processed === 1, 3000);
    const counts = queue.countByState();
    expect(counts.processed).toBe(1);
    expect(counts.queued).toBe(0);
    expect(counts.errored).toBe(0);

    await client.close();
    await app.stop();
  });

  test('server 4xx response marks the row errored', async () => {
    startMockServer((cmd) => ({
      type: 'agent:transmit:response',
      channel: cmd.channel,
      remote: cmd.remote,
      callback: cmd.callback,
      contentType: ContentType.TEXT,
      statusCode: 500,
      body: 'server boom',
    } satisfies AgentTransmitResponse));

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [
        { name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) },
      ],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    const response = await client.sendAndWait(TEST_MSG('INT_500'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    // Sender still got CA — the durable contract held even though the upstream forwarding failed.
    expect(response.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    const queue = app.getDurableQueue() as DurableQueue;
    await waitForRow(queue, (counts) => counts.errored === 1, 3000);
    expect(queue.countByState().errored).toBe(1);

    await client.close();
    await app.stop();
  });

  test('restart recovery: rows left in processing across process boundary become errored', async () => {
    // We don't kill the App mid-flight (worker.stop() drains gracefully). Instead
    // we simulate the crash directly against the underlying DB — the same state
    // a SIGKILL would leave — and confirm that the next App.start() picks it up
    // and runs recoverOnStartup() during reloadConfig. This exercises the actual
    // wiring without requiring a real process boundary.
    startMockServer(() => undefined);
    const [endpoint] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const queuePath = join(dir, 'queue.sqlite');
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [
        { name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) },
      ],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: queuePath },
      ],
    });

    // Pre-stage a "crashed mid-flight" row directly: insert + claim, then close
    // the DB without finalizing. On next open, the row is still in processing.
    {
      const queue = DurableQueue.open({ path: queuePath, log: console as unknown as Parameters<typeof DurableQueue.open>[0]['log'] });
      const r = queue.enqueue({
        channelName: 'dq-test',
        remote: '1.2.3.4:5000',
        msgControlId: 'CRASHED',
        msgType: 'ADT^A01',
        body: Buffer.from('MSH|...'),
        encoding: 'utf-8',
        enhancedMode: 'standard',
        callbackId: 'cb-crashed',
        seqNo: null,
        receivedAt: Date.now(),
      });
      expect(r.kind).toBe('inserted');
      queue.claimNext('dq-test'); // → processing
      queue.close();
    }

    // Now start the App. reloadConfig() opens the queue and calls recoverOnStartup.
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;
    const counts = queue.countByState();
    expect(counts.processing).toBe(0);
    expect(counts.errored).toBe(1);
    await app.stop();
  });
});

/**
 * Polls the queue for a state predicate until satisfied or timeout. Avoids
 * arbitrary sleep()s in the test body so failures fail fast and pass quickly.
 * @param queue - The queue whose state-counts will be polled.
 * @param predicate - Condition over the count snapshot to wait for.
 * @param timeoutMs - Total time to wait before throwing.
 */
async function waitForRow(
  queue: DurableQueue,
  predicate: (counts: ReturnType<DurableQueue['countByState']>) => boolean,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate(queue.countByState())) {
      return;
    }
    await sleep(25);
  }
  throw new Error(`waitForRow: predicate not satisfied after ${timeoutMs}ms; counts=${JSON.stringify(queue.countByState())}`);
}

