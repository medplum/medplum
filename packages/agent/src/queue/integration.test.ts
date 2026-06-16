// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * End-to-end integration tests for the durable inbound queue.
 *
 * These spin up a full {@link App} (with a mocked Medplum WS server) and a real
 * HL7 client, then drive scenarios from DURABLE_QUEUE_ARCHITECTURE.md §14.2. The unit
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
import type { Client } from 'mock-socket';
import { Server } from 'mock-socket';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../app';
import type { Channel } from '../channel';
import type { AgentHl7Channel } from '../hl7';
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
    console.log = vi.fn();
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
              JSON.stringify({
                type: 'agent:heartbeat:response',
                version: MEDPLUM_VERSION,
              } satisfies AgentHeartbeatResponse)
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
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
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
    expect(counts.failed).toBe(0);
    expect(counts.rejected).toBe(0);
    // The happy path delivered the ACK back to the source.
    expect(queue.findSeenByControlId('dq-test', 'INT_001')?.ackOutcome).toBe('delivered');

    await client.close();
    await app.stop();
  });

  // Regression: in durable aaMode the source's only ACK is the commit AA sent at
  // intake — the worker suppresses the Bot's app-level AA (it never goes through
  // sendToRemote, see applyServerResponse). So the pending RTT entry recorded at
  // intake (handleMessage → recordMessageSent) MUST be balanced by the commit ACK
  // (handleMessageDurable → recordImmediateAck). Without that, EVERY committed
  // aaMode message lingers in the pending-RTT map and is eventually GC'd with a
  // "never got response" warning, and getPendingCount() never returns to 0.
  test('aaMode happy path: the commit AA balances the pending RTT entry (no dangling pending message)', async () => {
    startMockServer((cmd) => {
      // Reply 200 with an AA. In aaMode this app-level AA is suppressed at the
      // worker and never forwarded to the source, so it can't balance the entry —
      // the commit AA from intake is the only thing that can.
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
      address: 'mllp://0.0.0.0:0?enhanced=aa',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();

    const client = new Hl7Client({ host: 'localhost', port });
    const response = await client.sendAndWait(TEST_MSG('INT_AA'), {
      // In aaMode the first (and only) ACK to the source is the commit AA.
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(response.getSegment('MSA')?.getField(1)?.toString()).toBe('AA');

    // The worker processes the row (and suppresses the Bot's app-level AA).
    const queue = app.getDurableQueue() as DurableQueue;
    await waitForRow(queue, (counts) => counts.processed === 1, 3000);

    // The commit AA balanced the entry recorded at intake: nothing dangles in the
    // pending-RTT map, so no message will be GC'd with a "never got response"
    // warning. (Pre-fix this stayed at 1 forever.)
    const channel = app.channels.get('dq-test') as unknown as AgentHl7Channel;
    expect(channel.stats.getPendingCount()).toBe(0);

    await client.close();
    await app.stop();
  });

  test('server 5xx response marks the row failed (transient, ack not owed)', async () => {
    startMockServer(
      (cmd) =>
        ({
          type: 'agent:transmit:response',
          channel: cmd.channel,
          remote: cmd.remote,
          callback: cmd.callback,
          contentType: ContentType.TEXT,
          statusCode: 500,
          body: 'server boom',
        }) satisfies AgentTransmitResponse
    );

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
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
    await waitForRow(queue, (counts) => counts.failed === 1, 3000);
    expect(queue.countByState().failed).toBe(1);
    const row = queue.findSeenByControlId('dq-test', 'INT_500');
    expect(row?.errorCode).toBe('server-error');
    expect(row?.ackOutcome).toBe('not_owed');

    await client.close();
    await app.stop();
  });

  test('server 4xx response marks the row rejected (permanent), never re-dispatched', async () => {
    let dispatches = 0;
    startMockServer((cmd) => {
      dispatches++;
      return {
        type: 'agent:transmit:response',
        channel: cmd.channel,
        remote: cmd.remote,
        callback: cmd.callback,
        contentType: ContentType.TEXT,
        statusCode: 422,
        body: 'rejected: unparseable',
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
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    const response = await client.sendAndWait(TEST_MSG('INT_422'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(response.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    const queue = app.getDurableQueue() as DurableQueue;
    await waitForRow(queue, (counts) => counts.rejected === 1, 3000);
    const row = queue.findSeenByControlId('dq-test', 'INT_422');
    expect(row?.state).toBe('rejected');
    expect(row?.errorCode).toBe('server-rejected'); // permanent — never retried
    expect(row?.ackOutcome).toBe('not_owed');
    expect(dispatches).toBe(1);

    await client.close();
    await app.stop();
  });

  test('heartbeat ticks flush the WAL via checkpointWalIfDirty', async () => {
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
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: queuePath },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.NONE);
    await app.start();

    // The startup sweep already checkpointed the open-time writes, so dirty the
    // WAL with a fresh row — the state a burst of traffic leaves behind.
    const queue = app.getDurableQueue() as DurableQueue;
    queue.enqueue({
      channelName: 'dq-test',
      remote: '1.2.3.4:5000',
      msgControlId: 'HB_CKPT',
      msgType: 'ADT^A01',
      originalMessage: Buffer.from('MSH|...'),
      finalizedMessage: Buffer.from('MSH|...'),
      encoding: 'utf-8',
      enhancedMode: 'standard',
      callbackId: 'cb-hb-ckpt',
      seqNo: null,
      receivedAt: Date.now(),
    });
    const walPath = `${queuePath}-wal`;
    expect(statSync(walPath).size).toBeGreaterThan(0);

    // One heartbeat tick → the listener registered in reconcileDurableQueue
    // runs checkpointWalIfDirty() and truncates the WAL.
    app.heartbeatEmitter.dispatchEvent({ type: 'heartbeat' });
    expect(statSync(walPath).size).toBe(0);

    await app.stop();
  });

  test('stop() closes the durable queue and flushes the WAL even when a channel fails to stop', async () => {
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
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: queuePath },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.NONE);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;
    expect(queue).toBeDefined();

    // Make the channel stop for real (so its port is released) but then throw,
    // simulating the drain failures that previously skipped queue teardown.
    const channel = app.channels.get('dq-test') as Channel;
    const realStop = channel.stop.bind(channel);
    vi.spyOn(channel, 'stop').mockImplementation(async () => {
      await realStop();
      throw new Error('simulated channel stop failure');
    });

    await app.stop();

    // The queue DB was closed (any statement now throws) and the WAL was
    // flushed into the main file (deleted on close, or truncated to zero).
    expect(() => queue.countByState()).toThrow();
    const walPath = `${queuePath}-wal`;
    expect(existsSync(walPath) ? statSync(walPath).size : 0).toBe(0);
  });

  test('idempotent duplicate after processing replays the prior server response ACK', async () => {
    // Reply 200 + AA so the row reaches `processed` with a stored response body.
    startMockServer((cmd) => {
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
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    const first = await client.sendAndWait(TEST_MSG('INT_DUP'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(first.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    const queue = app.getDurableQueue() as DurableQueue;
    await waitForRow(queue, (counts) => counts.processed === 1, 3000);

    // Exact retransmit: the sender should get the prior server response ACK (AA),
    // and no new row should be created.
    const replay = await client.sendAndWait(TEST_MSG('INT_DUP'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(replay.getSegment('MSA')?.getField(1)?.toString()).toBe('AA');
    expect(queue.countByState()).toMatchObject({ processed: 1, queued: 0, processing: 0, failed: 0, rejected: 0 });

    await client.close();
    await app.stop();
  });

  test('idempotent duplicate before any server response replays the commit ACK', async () => {
    // Never reply: the first row stays queued/processing with no server response,
    // so the duplicate must fall back to a commit ACK (CA) replay.
    startMockServer(() => undefined);

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    const first = await client.sendAndWait(TEST_MSG('INT_DUP2'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(first.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    const replay = await client.sendAndWait(TEST_MSG('INT_DUP2'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(replay.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    // Still exactly one row — the duplicate was not enqueued.
    const queue = app.getDurableQueue() as DurableQueue;
    const counts = queue.countByState();
    expect(counts.queued + counts.processing).toBe(1);
    expect(counts.nacked).toBe(0);

    await client.close();
    await app.stop();
  });

  test('idempotent duplicate with different content for a seen control ID is rejected with AR', async () => {
    startMockServer(() => undefined);

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    const first = await client.sendAndWait(TEST_MSG('INT_MM'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(first.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    // Same control ID, different PID → a different message reusing a committed ID.
    const mismatched = Hl7Message.parse(
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|INT_MM|P|2.5\r' +
        'PID|||PATID9999^5^M11||SMITH^JANE^B||19700101|F\r'
    );
    const rejected = await client.sendAndWait(mismatched, { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    // Standard enhanced mode → CR (a terminal *reject*: retransmitting a message
    // that reuses a committed control ID can never succeed, so the peer must not retry).
    expect(rejected.getSegment('MSA')?.getField(1)?.toString()).toBe('CR');
    expect(rejected.getSegment('MSA')?.getField(3)?.toString()).toContain('different content');

    // The mismatch produced a nacked audit row; the original is untouched.
    const queue = app.getDurableQueue() as DurableQueue;
    const counts = queue.countByState();
    expect(counts.nacked).toBe(1);
    expect(counts.queued + counts.processing).toBe(1);

    // Stats are balanced: the reject recorded an ack, so the control ID isn't
    // left dangling in the pending-RTT map.
    const channel = app.channels.get('dq-test') as unknown as AgentHl7Channel;
    expect(channel.stats.getPendingCount()).toBe(0);

    await client.close();
    await app.stop();
  });

  // The default duplicate policy is `idempotent` (replay the prior ACK). `reject`
  // is the opposite stance: surface every retransmit as a hard error instead of
  // silently absorbing it. The contrast with the idempotent tests above is the
  // point — the SAME exact retransmit that gets a replayed CA/AA under idempotent
  // mode gets a terminal CR/AR here, plus a `nacked` audit row, and is never
  // re-forwarded to the server. Real-world trigger: a sender that didn't see its
  // ACK in time resends the same MSH.10, and the operator wants duplicates flagged
  // (e.g. to detect a misbehaving upstream) rather than de-duplicated.
  test('duplicateBehavior=reject: an exact retransmit of a committed message is rejected with CR and never re-forwarded', async () => {
    // Reply 200 + AA so the first message reaches `processed` with a stored response.
    const transmits: string[] = [];
    startMockServer((cmd) => {
      transmits.push(cmd.body);
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
      address: 'mllp://0.0.0.0:0?enhanced=true&duplicateBehavior=reject',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    const first = await client.sendAndWait(TEST_MSG('INT_RJ'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(first.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    const queue = app.getDurableQueue() as DurableQueue;
    await waitForRow(queue, (counts) => counts.processed === 1, 3000);

    // The exact same message again. Idempotent mode would replay the AA; reject
    // mode terminally rejects it: standard enhanced → CR (the peer must NOT retry,
    // a resend reusing the committed control ID fails identically).
    const rejected = await client.sendAndWait(TEST_MSG('INT_RJ'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(rejected.getSegment('MSA')?.getField(1)?.toString()).toBe('CR');
    expect(rejected.getSegment('MSA')?.getField(3)?.toString()).toContain('duplicate control id');

    // A `nacked` audit row was inserted; the original `processed` row is untouched.
    expect(queue.countByState()).toMatchObject({
      processed: 1,
      nacked: 1,
      queued: 0,
      processing: 0,
      failed: 0,
      rejected: 0,
    });
    // findSeenByControlId excludes nacked rows, so it still resolves to the original.
    expect(queue.findSeenByControlId('dq-test', 'INT_RJ')?.state).toBe('processed');

    // The audit row carries the machine-readable reject classification and owes no ACK.
    const audit = nackedRow(queue, 'dq-test', 'INT_RJ');
    expect(audit.error_code).toBe('duplicate-rejected');
    expect(audit.ack_outcome).toBe('not_owed');

    // The reject is intake-only: the duplicate was never re-dispatched to the
    // server, so the Bot saw the message exactly once.
    expect(transmits).toHaveLength(1);

    // Stats balanced: the synchronous reject recorded an ack, so the control ID
    // isn't left dangling in the pending-RTT map.
    const channel = app.channels.get('dq-test') as unknown as AgentHl7Channel;
    expect(channel.stats.getPendingCount()).toBe(0);

    await client.close();
    await app.stop();
  });

  // Companion to the test above, exercising the in-flight branch: the retransmit
  // arrives while the original is still queued/processing (the `uq_inbound_dup_active`
  // path) rather than after it settled. Also covers the aaMode NACK code (AR).
  test('duplicateBehavior=reject (aaMode): a retransmit while the original is still in flight is rejected with AR', async () => {
    // Never reply, so the first row stays queued/processing with no server response.
    const transmits: string[] = [];
    startMockServer((cmd) => {
      transmits.push(cmd.body);
      return undefined;
    });

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=aa&duplicateBehavior=reject',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    // aaMode → the commit ACK is AA (no separate app-level ACK follows).
    const first = await client.sendAndWait(TEST_MSG('INT_RJ2'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(first.getSegment('MSA')?.getField(1)?.toString()).toBe('AA');

    // Let the worker claim + dispatch the original (it then parks in `processing`
    // awaiting the response that never comes). This guarantees the retransmit hits
    // the in-flight dedupe path AND that the one transmit below is the original.
    const queue = app.getDurableQueue() as DurableQueue;
    await waitForRow(queue, (counts) => counts.processing === 1, 3000);
    expect(transmits).toHaveLength(1);

    // Retransmit while the original is still in flight (queued/processing).
    const rejected = await client.sendAndWait(TEST_MSG('INT_RJ2'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    // aaMode → AR (the application-level reject), the terminal counterpart of CR.
    expect(rejected.getSegment('MSA')?.getField(1)?.toString()).toBe('AR');
    expect(rejected.getSegment('MSA')?.getField(3)?.toString()).toContain('duplicate control id');

    const counts = queue.countByState();
    expect(counts.nacked).toBe(1);
    // Exactly one live row for the control ID; the duplicate did not enqueue.
    expect(counts.queued + counts.processing).toBe(1);
    expect(nackedRow(queue, 'dq-test', 'INT_RJ2').error_code).toBe('duplicate-rejected');

    // The duplicate was rejected at intake; only the original was dispatched.
    expect(transmits).toHaveLength(1);

    await client.close();
    await app.stop();
  });

  test('assignSeqNo: a retransmit dedupes on the original message despite a new sequence number', async () => {
    // Never reply, so the first row stays queued/processing (no server response).
    startMockServer(() => undefined);

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true&assignSeqNo=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    const first = await client.sendAndWait(TEST_MSG('SEQ1'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(first.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    // The agent stamps MSH.13 (assignSeqNo), so the retransmit's *finalized* bytes
    // differ from the first (a new sequence number) — but the *original* matches,
    // so it's recognized as a retransmit and re-acked (CA), not rejected (AR).
    const replay = await client.sendAndWait(TEST_MSG('SEQ1'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(replay.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    const queue = app.getDurableQueue() as DurableQueue;
    const counts = queue.countByState();
    expect(counts.queued + counts.processing).toBe(1);
    expect(counts.nacked).toBe(0);

    await client.close();
    await app.stop();
  });

  test('assignSeqNo: a duplicate does not consume a sequence number', async () => {
    startMockServer(() => undefined);

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true&assignSeqNo=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    // First message gets sequence 0.
    await client.sendAndWait(TEST_MSG('A'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    // Retransmit of A: deduped, must NOT consume a sequence number.
    await client.sendAndWait(TEST_MSG('A'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    // A distinct message therefore gets sequence 1 (not 2).
    await client.sendAndWait(TEST_MSG('B'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });

    const queue = app.getDurableQueue() as DurableQueue;
    expect(queue.findSeenByControlId('dq-test', 'A')?.seqNo).toBe(0);
    expect(queue.findSeenByControlId('dq-test', 'B')?.seqNo).toBe(1);

    await client.close();
    await app.stop();
  });

  test('assignSeqNo: a storage error does not consume a sequence number', async () => {
    startMockServer(() => undefined);

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true&assignSeqNo=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;
    const client = new Hl7Client({ host: 'localhost', port });

    // Force the first intake's enqueue to fail (simulated storage error). The
    // sequence number was only peeked (stamped as a candidate), never committed.
    const enqueueSpy = vi.spyOn(queue, 'enqueue').mockImplementationOnce(() => {
      throw new Error('simulated disk full');
    });

    const failed = await client.sendAndWait(TEST_MSG('X'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    // A storage error is transient → CE (the retryable commit code), not a reject.
    expect(failed.getSegment('MSA')?.getField(1)?.toString()).toBe('CE');
    enqueueSpy.mockRestore();

    // The next message must reuse sequence 0 — the failed one consumed nothing.
    await client.sendAndWait(TEST_MSG('Y'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(queue.findSeenByControlId('dq-test', 'Y')?.seqNo).toBe(0);

    await client.close();
    await app.stop();
  });

  test('assignSeqNo: a content-mismatch reject records the inbound MSH.13 on its nacked audit row, not a fresh candidate', async () => {
    // No reply, so the first row stays queued/processing (still a "seen" prior row).
    startMockServer(() => undefined);

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true&assignSeqNo=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const client = new Hl7Client({ host: 'localhost', port });

    // First MM commits and is assigned sequence 0.
    const first = await client.sendAndWait(TEST_MSG('MM'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(first.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    // Same control ID, different PID → a different message reusing a committed ID.
    // It carries its own MSH.13 (77) so we can prove the audit row records the
    // *inbound* sequence field, never a freshly-peeked candidate (which would be 1).
    const mismatched = Hl7Message.parse(
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MM|P|2.5|77\r' +
        'PID|||PATID9999^5^M11||SMITH^JANE^B||19700101|F\r'
    );
    const rejected = await client.sendAndWait(mismatched, { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(rejected.getSegment('MSA')?.getField(1)?.toString()).toBe('CR');

    const queue = app.getDurableQueue() as DurableQueue;
    // The nacked audit row carries the inbound MSH.13 (77), NOT a fresh candidate (1).
    expect(nackedSeqNo(queue, 'dq-test', 'MM')).toBe(77);
    // The committed original keeps sequence 0, untouched by the collision.
    expect(queue.findSeenByControlId('dq-test', 'MM')?.seqNo).toBe(0);

    // The rejected collision consumed no sequence number: the next fresh message
    // gets sequence 1, not 2.
    await client.sendAndWait(TEST_MSG('FRESH'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(queue.findSeenByControlId('dq-test', 'FRESH')?.seqNo).toBe(1);

    await client.close();
    await app.stop();
  });

  test('assignSeqNo: a storage error records the peeked candidate on its nacked audit row', async () => {
    startMockServer(() => undefined);

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true&assignSeqNo=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;
    const client = new Hl7Client({ host: 'localhost', port });

    // Fail the *insert* of X's queued row — not the peek/stamp that precedes it —
    // so the candidate sequence 0 was assigned into MSH.13 before the write failed.
    // A BEFORE INSERT trigger is a faithful stand-in for a disk/IO error: it aborts
    // the real INSERT at exactly the point a storage failure would, after assignment.
    // (The audit row is written with state 'nacked', so the trigger skips it.)
    queue.getDb().exec(`
      CREATE TEMP TRIGGER fail_insert_x BEFORE INSERT ON inbound_hl7_messages
      WHEN NEW.msg_control_id = 'X' AND NEW.state = 'queued'
      BEGIN SELECT RAISE(ABORT, 'simulated disk full'); END;
    `);

    const failed = await client.sendAndWait(TEST_MSG('X'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    // A storage error is transient → CE (the retryable commit code), not a reject.
    expect(failed.getSegment('MSA')?.getField(1)?.toString()).toBe('CE');

    // The audit row records the candidate (0) that was peeked + stamped into MSH.13
    // before the insert failed — even though the counter itself never advanced.
    expect(nackedSeqNo(queue, 'dq-test', 'X')).toBe(0);

    // Drop the trigger so the next message can be inserted normally.
    queue.getDb().exec('DROP TRIGGER fail_insert_x');

    // The counter never advanced: the next message reuses sequence 0.
    await client.sendAndWait(TEST_MSG('Y'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(queue.findSeenByControlId('dq-test', 'Y')?.seqNo).toBe(0);

    await client.close();
    await app.stop();
  });

  test('storage error is retryable by the peer: a CE retransmit is accepted fresh and processed', async () => {
    // A successfully-enqueued message reaches `processed` (200 + AA).
    startMockServer((cmd) => {
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
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;
    const client = new Hl7Client({ host: 'localhost', port });

    // First intake hits a (simulated, transient) storage error. The agent answers
    // CE — the retryable commit code — and writes only a `nacked` audit row, so
    // the control ID is never committed and isn't poisoned for a later resend.
    const enqueueSpy = vi.spyOn(queue, 'enqueue').mockImplementationOnce(() => {
      throw new Error('simulated disk full');
    });
    const failed = await client.sendAndWait(TEST_MSG('RETRY_ME'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(failed.getSegment('MSA')?.getField(1)?.toString()).toBe('CE');
    enqueueSpy.mockRestore();

    // The peer retransmits the same message. Because the prior row is `nacked`
    // (never committed), this is treated as a fresh delivery — CA, then processed —
    // not a duplicate replay of the failure.
    const retried = await client.sendAndWait(TEST_MSG('RETRY_ME'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(retried.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    await waitForRow(queue, (counts) => counts.processed === 1, 3000);
    const counts = queue.countByState();
    expect(counts.processed).toBe(1); // the retransmit went all the way through
    expect(counts.nacked).toBe(1); // the storage-error audit row from the first attempt
    expect(counts.queued + counts.processing + counts.failed + counts.rejected).toBe(0);

    await client.close();
    await app.stop();
  });

  test('a committed duplicate is replayed, never re-dispatched to the server', async () => {
    // Count how many times we dispatch upstream so we can assert the duplicate
    // is *not* reprocessed.
    let dispatches = 0;
    startMockServer((cmd) => {
      dispatches++;
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
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;
    const client = new Hl7Client({ host: 'localhost', port });

    const first = await client.sendAndWait(TEST_MSG('COMMITTED'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(first.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');
    await waitForRow(queue, (counts) => counts.processed === 1, 3000);
    expect(dispatches).toBe(1);

    // The peer retransmits the same committed message. It must get the prior
    // server ACK replayed — and the server must NOT be dispatched a second time
    // (a committed control ID is never reprocessed).
    const replay = await client.sendAndWait(TEST_MSG('COMMITTED'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(replay.getSegment('MSA')?.getField(1)?.toString()).toBe('AA');
    expect(dispatches).toBe(1); // unchanged: no re-dispatch
    expect(queue.countByState()).toMatchObject({
      processed: 1,
      queued: 0,
      processing: 0,
      failed: 0,
      rejected: 0,
      nacked: 0,
    });

    await client.close();
    await app.stop();
  });

  test('ack-delivery failure (source connection closed) → processed+undelivered, no re-dispatch; retransmit replays and flips to delivered', async () => {
    // The worker forwards upstream and gets a 2xx + AA, but the source HL7
    // connection is gone by the time the worker tries to deliver that ACK back.
    // The two legs are tracked independently: the Bot leg succeeded, so the row
    // is `processed`; only the source leg failed, so ack_outcome = `undelivered`.
    // It must NOT be a Bot-leg failure (`failed`/`rejected`) and the server must
    // NOT be hit again — not now, and not when the peer retransmits (which must
    // replay the stored ACK and flip the row to `delivered`). This pins the
    // invariant the Path-2 retry layer keys off: an undelivered ACK is never a
    // re-dispatchable upstream failure (doing so would double-process upstream
    // and loop against the dead remote).
    let dispatches = 0;
    let releaseReply!: () => void;
    const replyGate = new Promise<void>((resolve) => {
      releaseReply = resolve;
    });

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
              JSON.stringify({
                type: 'agent:heartbeat:response',
                version: MEDPLUM_VERSION,
              } satisfies AgentHeartbeatResponse)
            )
          );
          return;
        }
        if (command.type === 'agent:transmit:request') {
          dispatches++;
          const ack = Hl7Message.parse(command.body).buildAck({ ackCode: 'AA' });
          const reply = {
            type: 'agent:transmit:response',
            channel: command.channel,
            remote: command.remote,
            callback: command.callback,
            contentType: ContentType.HL7_V2,
            statusCode: 200,
            body: ack.toString(),
          } satisfies AgentTransmitResponse;
          // Defer the server reply until the test has closed the source
          // connection, so the worker's app-level ACK lands on a dead socket.
          replyGate.then(() => socket.send(Buffer.from(JSON.stringify(reply)))).catch(() => undefined);
        }
      });
    });

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;
    const channel = app.channels.get('dq-test') as unknown as AgentHl7Channel;

    // Send a message and get the deferred commit ACK (CA).
    const client = new Hl7Client({ host: 'localhost', port });
    const ca = await client.sendAndWait(TEST_MSG('ACKFAIL'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(ca.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    // Close the source connection, then wait for the agent to observe the close
    // and drop the remote — so the pending app-level ACK has nowhere to go.
    await client.close();
    const start = Date.now();
    while (channel.connections.size > 0 && Date.now() - start < 3000) {
      await sleep(25);
    }
    expect(channel.connections.size).toBe(0);

    // Release the server reply. The worker records the 2xx and marks the row
    // `processed`; the ACK to the (now-absent) source fails → ack `undelivered`.
    releaseReply();
    await waitForRow(queue, () => queue.findSeenByControlId('dq-test', 'ACKFAIL')?.ackOutcome === 'undelivered', 3000);

    const undelivered = queue.findSeenByControlId('dq-test', 'ACKFAIL');
    expect(undelivered?.state).toBe('processed'); // Bot leg succeeded
    expect(undelivered?.ackOutcome).toBe('undelivered'); // source leg failed
    expect(undelivered?.errorCode).toBeNull(); // NOT a Bot-leg error
    // The server was reached exactly once; the failure was purely on the return path.
    expect(dispatches).toBe(1);
    // It is `processed`, not a re-dispatchable `failed`/`rejected`.
    expect(queue.countByState()).toMatchObject({ processed: 1, failed: 0, rejected: 0 });

    // The peer retransmits over a fresh connection. It must get the *stored*
    // server ACK replayed (AA), the server must NOT be dispatched again, and the
    // row's source leg must flip to `delivered` (state unchanged).
    const client2 = new Hl7Client({ host: 'localhost', port });
    const replay = await client2.sendAndWait(TEST_MSG('ACKFAIL'), {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    expect(replay.getSegment('MSA')?.getField(1)?.toString()).toBe('AA');
    expect(dispatches).toBe(1); // no re-dispatch — replayed from the durable row

    const afterReplay = queue.findSeenByControlId('dq-test', 'ACKFAIL');
    expect(afterReplay?.state).toBe('processed');
    expect(afterReplay?.ackOutcome).toBe('delivered'); // retransmit closed the source leg
    expect(queue.countByState()).toMatchObject({
      processed: 1,
      queued: 0,
      processing: 0,
      failed: 0,
      rejected: 0,
      nacked: 0,
    });

    await client2.close();
    await app.stop();
  });

  test('restart recovery: rows left in processing across process boundary become failed', async () => {
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
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: queuePath },
      ],
    });

    // Pre-stage a "crashed mid-flight" row directly: insert + claim, then close
    // the DB without finalizing. On next open, the row is still in processing.
    {
      const queue = DurableQueue.open({
        path: queuePath,
        log: console as unknown as Parameters<typeof DurableQueue.open>[0]['log'],
      });
      const r = queue.enqueue({
        channelName: 'dq-test',
        remote: '1.2.3.4:5000',
        msgControlId: 'CRASHED',
        msgType: 'ADT^A01',
        originalMessage: Buffer.from('MSH|...'),
        finalizedMessage: Buffer.from('MSH|...'),
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
    expect(counts.failed).toBe(1);
    const recovered = queue.findSeenByControlId('dq-test', 'CRASHED');
    expect(recovered?.errorCode).toBe('interrupted');
    // The ack leg is genuinely unknown for an interrupted row — left pending.
    expect(recovered?.ackOutcome).toBe('pending');
    await app.stop();
  });

  test('non-UTF-8 channel encoding (iso-8859-1): message is accepted, CA sent, and forwarded text preserved', async () => {
    // Regression: the durable path used to re-encode via `Buffer.from(text,
    // channelEncoding)`. For an encoding Node's Buffer doesn't natively know
    // (iso-8859-1, windows-1252, ...) that throws ERR_UNKNOWN_ENCODING, so the
    // message was dropped at intake with NO ACK and the sender retransmitted
    // forever. The forwarded body must equal the decoded HL7 text — same as the
    // legacy path — regardless of the wire encoding.
    let forwardedBody: string | undefined;
    startMockServer((cmd) => {
      forwardedBody = cmd.body;
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
      address: 'mllp://0.0.0.0:0?enhanced=true&encoding=iso-8859-1',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;

    // A Latin-1 name (José) — a byte iso-8859-1 represents but UTF-8 encodes
    // differently — to prove the decode/forward round-trips the text, not bytes.
    const msg = Hl7Message.parse(
      `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|ISO_001|P|2.5\r` +
        'PID|||PATID1234^5^M11||JOSÉ^WILLIAM^A^III||19610615|M\r'
    );
    // The client must speak the same wire encoding as the channel.
    const client = new Hl7Client({ host: 'localhost', port, encoding: 'iso-8859-1' });
    const response = await client.sendAndWait(msg, {
      returnAck: ReturnAckCategory.FIRST,
      timeoutMs: 5000,
    });
    // Pre-fix this never arrived — intake threw and dropped the message.
    expect(response.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');

    await waitForRow(queue, (counts) => counts.processed === 1, 3000);
    // The forwarded body is the decoded HL7 text with the accented name intact.
    expect(forwardedBody).toContain('JOSÉ');
    expect(queue.countByState()).toMatchObject({ processed: 1, queued: 0, failed: 0, rejected: 0, nacked: 0 });

    await client.close();
    await app.stop();
  });

  // Widen the encoding matrix beyond latin-1: windows-1252 (European feeds) and
  // shift_jis (East-Asian feeds) decode through different iconv code paths than
  // iso-8859-1. The agent passes the channel `encoding` straight to iconv (no
  // allowlist), decodes the wire bytes at intake, and forwards the decoded text as
  // UTF-8 — so the body the Bot receives must carry the original characters intact,
  // and a retransmit must still dedupe on the raw bytes. Real-world trigger: legacy
  // HIS/LIS interfaces that emit cp1252 or shift_jis rather than UTF-8.
  test('non-UTF-8 channel encodings (windows-1252, shift_jis): messages round-trip and dedupe on raw bytes', async () => {
    let forwardedBody: string | undefined;
    let transmitCount = 0;
    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          return;
        }
        if (command.type === 'agent:heartbeat:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response', version: MEDPLUM_VERSION })));
          return;
        }
        if (command.type === 'agent:transmit:request') {
          transmitCount++;
          forwardedBody = command.body;
          const ack = Hl7Message.parse(command.body).buildAck({ ackCode: 'AA' });
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                callback: command.callback,
                contentType: ContentType.HL7_V2,
                statusCode: 200,
                body: ack.toString(),
              } satisfies AgentTransmitResponse)
            )
          );
        }
      });
    });

    // Runs a single encoding round-trip end to end on its own app/port/DB, then a
    // retransmit of the same control ID to prove raw-byte dedupe under that encoding.
    async function roundTrip(encoding: string, controlId: string, nameField: string, dbFile: string): Promise<void> {
      forwardedBody = undefined;
      transmitCount = 0;
      const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
        ...BASE_ENDPOINT,
        address: `mllp://0.0.0.0:0?enhanced=true&encoding=${encoding}`,
      });
      const agent = await medplum.createResource<Agent>({
        resourceType: 'Agent',
        name: `Durable Queue Test Agent (${encoding})`,
        status: 'active',
        channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
        setting: [
          { name: 'durableQueue', valueBoolean: true },
          { name: 'queueDbPath', valueString: join(dir, dbFile) },
        ],
      });
      const app = new App(medplum, agent.id, LogLevel.WARN);
      await app.start();
      const queue = app.getDurableQueue() as DurableQueue;

      const msg = Hl7Message.parse(
        `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|${controlId}|P|2.5\r` +
          `PID|||PATID1234^5^M11||${nameField}||19610615|M\r`
      );
      // The client must speak the same wire encoding as the channel.
      const client = new Hl7Client({ host: 'localhost', port, encoding });

      const response = await client.sendAndWait(msg, { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
      expect(response.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');
      await waitForRow(queue, (c) => c.processed === 1, 3000);
      // Decoded HL7 text forwarded as UTF-8 with the non-ASCII name intact.
      expect(forwardedBody).toContain(nameField);
      expect(queue.countByState()).toMatchObject({ processed: 1, queued: 0, failed: 0, rejected: 0, nacked: 0 });

      // Retransmit the same message: idempotent dedup keys off the raw received
      // bytes, so it replays the prior ACK rather than enqueuing/forwarding again.
      const replay = await client.sendAndWait(msg, { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
      expect(replay.getSegment('MSA')?.getField(1)?.toString()).toBe('AA'); // prior server ACK replayed
      expect(queue.countByState()).toMatchObject({ processed: 1, nacked: 0 });
      expect(transmitCount).toBe(1); // the duplicate was never re-forwarded

      await client.close();
      await app.stop();
    }

    await roundTrip('windows-1252', 'CP1252_001', 'MÜLLER^HANS', 'queue-cp1252.sqlite');
    await roundTrip('shift_jis', 'SJIS_0001', 'ﾔﾏﾀﾞ^ﾀﾛｳ', 'queue-sjis.sqlite');
  });

  // The durable CA promise must hold even under a concurrent shutdown: if a
  // source is *spamming* a channel at the exact moment App.stop() tears the
  // agent down, then for every message the source received a commit ACK (CA)
  // for, a durable row MUST survive the shutdown. The agent commits (enqueue
  // transaction) BEFORE sending the CA (hl7.ts: sendCommitAck fires only after
  // enqueue returns), so a CA the source observed is a promise the row is
  // persisted — and that promise can't be broken by stop() racing the intake,
  // the server.stop(), or the DB close. We never assert *processed* here: an
  // in-flight dispatch is rejected → failed on stop by design. The contract is
  // "no acknowledged message is lost," not "every message is delivered."
  test('spam-while-stopping: every CA the source received survives App.stop()', async () => {
    // Reply 200/AA so any row the worker manages to claim before drain processes
    // cleanly — but most rows won't be reached before stop; that's the point.
    startMockServer((cmd) => {
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
    const queuePath = join(dir, 'queue.sqlite');
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: queuePath },
      ],
    });

    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();

    // Control IDs the source got a CA for — i.e. the agent *promised* are committed.
    const committed: string[] = [];
    const client = new Hl7Client({ host: 'localhost', port });
    let seq = 0;

    // A tight loop hammering the channel. It only stops when the connection drops
    // (the server is being torn down) — i.e. it keeps firing straight through the
    // shutdown window so messages are genuinely in flight when stop() lands.
    const spamLoop = (async () => {
      for (;;) {
        const cid = `SPAM_${seq++}`;
        let response;
        try {
          response = await client.sendAndWait(TEST_MSG(cid), {
            // FIRST ACK in enhanced mode is the deferred commit CA.
            returnAck: ReturnAckCategory.FIRST,
            timeoutMs: 2000,
          });
        } catch {
          // Connection closed / refused mid-shutdown: this message was NOT
          // acknowledged, so the agent made no commit promise about it. Expected.
          return;
        }
        if (response.getSegment('MSA')?.getField(1)?.toString() === 'CA') {
          committed.push(cid);
        }
      }
    })();

    // Let a burst of messages get committed, then pull the plug while the loop is
    // still firing — stop() now races live intake, drain, and DB teardown.
    const startWait = Date.now();
    while (committed.length < 5 && Date.now() - startWait < 5000) {
      await sleep(10);
    }
    expect(committed.length).toBeGreaterThanOrEqual(5);

    await app.stop(); // concurrent with spamLoop still sending
    await spamLoop; // resolves once the source's connection drops
    await client.close();

    // App.stop() closed the queue DB; reopen the same file to inspect what
    // survived. (No App.start(), so recoverOnStartup does NOT run — we want the
    // raw post-shutdown state, not the post-recovery state.)
    const reopened = DurableQueue.open({
      path: queuePath,
      log: console as unknown as Parameters<typeof DurableQueue.open>[0]['log'],
    });
    try {
      // THE INVARIANT: every CA the source observed has a durable row. A missing
      // one would be a dishonest CA — the agent claimed a commit it then lost.
      const missing = committed.filter((cid) => !reopened.findSeenByControlId('dq-test', cid));
      expect(missing).toEqual([]);

      // Accounting: every acknowledged message is in some real state, none vanished.
      const counts = reopened.countByState();
      const accounted = counts.processed + counts.queued + counts.processing + counts.failed;
      expect(accounted).toBeGreaterThanOrEqual(committed.length);
      // We never NAK'd or rejected anything on the happy intake path.
      expect(counts.nacked).toBe(0);
      expect(counts.rejected).toBe(0);
    } finally {
      reopened.close();
    }
  });

  // Per-channel isolation: each channel gets its own worker, so a stalled
  // downstream on one channel must not block another. This is the durable queue's
  // "parallel across channels, serial within a channel" guarantee. Real-world
  // trigger: the Bot behind an ORU results feed hangs (slow DB write, deadlock),
  // while an ADT feed on a different port must keep flowing — "one bad interface
  // shouldn't take down the others", the classic integration-engine requirement.
  test('per-channel isolation: a stalled channel does not block a healthy one, and each channel stays FIFO', async () => {
    // The mock server withholds responses for the `oru` channel (its downstream is
    // "hung") but answers `adt` promptly. Capture the per-channel dispatch order.
    const transmits: { channel: string; controlId: string }[] = [];
    startMockServer((cmd) => {
      const controlId = Hl7Message.parse(cmd.body).getSegment('MSH')?.getField(10)?.toString() ?? '';
      transmits.push({ channel: cmd.channel, controlId });
      if (cmd.channel === 'oru') {
        // Stalled downstream: never reply. The oru worker parks in `processing`.
        return undefined;
      }
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

    const [adtEndpoint, adtPort] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const [oruEndpoint, oruPort] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [
        { name: 'adt', endpoint: createReference(adtEndpoint), targetReference: createReference(bot) },
        { name: 'oru', endpoint: createReference(oruEndpoint), targetReference: createReference(bot) },
      ],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;

    const oruClient = new Hl7Client({ host: 'localhost', port: oruPort });
    const adtClient = new Hl7Client({ host: 'localhost', port: adtPort });

    // Stall the oru channel first: 3 messages all get CA at intake, the worker
    // claims ORU_1 (→ processing, then hangs), ORU_2/ORU_3 queue behind it.
    for (const id of ['ORU_1', 'ORU_2', 'ORU_3']) {
      const ack = await oruClient.sendAndWait(TEST_MSG(id), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
      expect(ack.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');
    }
    // Wait until the oru worker has actually claimed + dispatched ORU_1.
    await waitForRow(queue, () => queue.getChannelDepth('oru').processing === 1, 3000);
    expect(queue.getChannelDepth('oru')).toMatchObject({ processing: 1, queued: 2 });

    // Now drive the adt channel. Despite oru being wedged, adt must fully drain.
    for (const id of ['ADT_1', 'ADT_2', 'ADT_3']) {
      const ack = await adtClient.sendAndWait(TEST_MSG(id), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
      expect(ack.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');
    }
    // Global `processed` reaching 3 means all three adt rows completed — oru never
    // contributes a processed row because its worker is still blocked on ORU_1.
    await waitForRow(queue, (counts) => counts.processed === 3, 3000);

    // adt drained in FIFO order, all delivered.
    const adtOrder = transmits.filter((t) => t.channel === 'adt').map((t) => t.controlId);
    expect(adtOrder).toEqual(['ADT_1', 'ADT_2', 'ADT_3']);
    for (const id of ['ADT_1', 'ADT_2', 'ADT_3']) {
      expect(queue.findSeenByControlId('adt', id)?.state).toBe('processed');
      expect(queue.findSeenByControlId('adt', id)?.ackOutcome).toBe('delivered');
    }

    // oru is still wedged exactly where it was — the stall is real, not absorbed:
    // its worker is serial, so only ORU_1 was ever dispatched; ORU_2/ORU_3 wait.
    expect(transmits.filter((t) => t.channel === 'oru')).toEqual([{ channel: 'oru', controlId: 'ORU_1' }]);
    expect(queue.getChannelDepth('oru')).toMatchObject({ processing: 1, queued: 2 });
    expect(queue.countByState()).toMatchObject({ processed: 3, processing: 1, queued: 2 });

    await oruClient.close();
    await adtClient.close();
    await app.stop();
  });

  // The durability headline: in enhanced mode we promise the sender a CA the moment
  // we durably persist a message — independent of whether the Medplum server is
  // reachable. So while the WS is down, intake keeps returning CA and rows pile up
  // as `queued` (the worker idles rather than dispatching into the void); when the
  // server returns, the backlog drains in FIFO order. Real-world trigger: a Medplum
  // server deploy / network blip mid-stream. Nothing the sender was told is safe
  // may be lost, and ordering must hold across the gap.
  test('WS backpressure: CAs keep flowing while the server is down, then the backlog drains in FIFO on reconnect', async () => {
    const transmits: string[] = [];
    let liveSocket: Client | undefined;
    const handler = (socket: Client): void => {
      liveSocket = socket;
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          return;
        }
        if (command.type === 'agent:heartbeat:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response', version: MEDPLUM_VERSION })));
          return;
        }
        if (command.type === 'agent:transmit:request') {
          transmits.push(Hl7Message.parse(command.body).getSegment('MSH')?.getField(10)?.toString() ?? '');
          const ack = Hl7Message.parse(command.body).buildAck({ ackCode: 'AA' });
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                callback: command.callback,
                contentType: ContentType.HL7_V2,
                statusCode: 200,
                body: ack.toString(),
              } satisfies AgentTransmitResponse)
            )
          );
        }
      });
    };
    mockServer.on('connection', handler);

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    app.heartbeatPeriod = 100; // speed up liveness detection + reconnect
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;

    // Become live, then yank the server out from under it.
    await waitFor(() => app.isLive(), 5000, 'app live');
    liveSocket?.close();
    mockServer.stop();
    await waitFor(() => !app.isLive(), 5000, 'app not live');

    // The HL7 listener is still bound, so intake keeps working: every message gets
    // a CA even though the server is unreachable and nothing can be dispatched.
    const client = new Hl7Client({ host: 'localhost', port });
    for (const id of ['BP_1', 'BP_2', 'BP_3', 'BP_4']) {
      const ack = await client.sendAndWait(TEST_MSG(id), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
      expect(ack.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');
    }

    // Backpressure: the worker idled (didn't dispatch into the void), so the rows
    // are all parked in `queued` and nothing reached the server.
    expect(queue.countByState()).toMatchObject({ queued: 4, processing: 0, processed: 0, failed: 0, rejected: 0 });
    expect(transmits).toHaveLength(0);

    // Server comes back on the same URL → the agent reconnects and drains.
    mockServer = new Server('wss://example.com/ws/agent');
    mockServer.on('connection', handler);
    await waitFor(() => app.isLive(), 10000, 'app live again');
    await waitForRow(queue, (counts) => counts.processed === 4, 5000);

    // Zero loss, FIFO preserved across the outage, every ACK delivered.
    expect(transmits).toEqual(['BP_1', 'BP_2', 'BP_3', 'BP_4']);
    expect(queue.countByState()).toMatchObject({ processed: 4, queued: 0, processing: 0, failed: 0, rejected: 0 });
    for (const id of ['BP_1', 'BP_2', 'BP_3', 'BP_4']) {
      expect(queue.findSeenByControlId('dq-test', id)?.ackOutcome).toBe('delivered');
    }

    await client.close();
    await app.stop();
  });

  // Zero-downtime handoff: the lease guarantees exactly one process runs workers at
  // a time. Two agents share one DB (the upgrade overlap). The follower (B) holds
  // the source connection; the leader (A) drains until it stops, then B takes the
  // lease and finishes the backlog — no double-processing, no loss. Real-world
  // trigger: a rolling agent restart/upgrade where the new process is already up
  // before the old one exits. (`restart recovery` above covers the sequential
  // crash case; this covers the *concurrent* overlap, which is what the lease is
  // actually for.)
  //
  // Topology note: A and B must bind different ports (both listeners are live
  // regardless of leadership), so the source connects to B. We drive messages into
  // B's listener; A (the leader) drains them via the shared `dq-test` queue. The
  // in-flight row A was holding when it stopped lands in `failed` (worker-stopped);
  // B then drains the rest and, because the source stayed on B, delivers their ACKs.
  test('lease handoff: a follower takes over draining when the leader stops, with no double-processing or loss', async () => {
    const transmits: string[] = [];
    let respond = false; // server withholds until after the handoff
    const handler = (socket: Client): void => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          return;
        }
        if (command.type === 'agent:heartbeat:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response', version: MEDPLUM_VERSION })));
          return;
        }
        if (command.type === 'agent:transmit:request') {
          transmits.push(Hl7Message.parse(command.body).getSegment('MSH')?.getField(10)?.toString() ?? '');
          if (!respond) {
            return; // wedge the leader so rows pile up for the handoff
          }
          const ack = Hl7Message.parse(command.body).buildAck({ ackCode: 'AA' });
          socket.send(
            Buffer.from(
              JSON.stringify({
                type: 'agent:transmit:response',
                channel: command.channel,
                remote: command.remote,
                callback: command.callback,
                contentType: ContentType.HL7_V2,
                statusCode: 200,
                body: ack.toString(),
              } satisfies AgentTransmitResponse)
            )
          );
        }
      });
    };
    mockServer.on('connection', handler);

    const dbPath = join(dir, 'queue.sqlite');
    const [endpointA] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const [endpointB, portB] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    // Two agents, SAME channel name (rows are keyed by channel_name, so either
    // worker can drain them) + SAME db path, different ports.
    const agentA = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Agent A',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpointA), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: dbPath },
      ],
    });
    const agentB = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Agent B',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpointB), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: dbPath },
      ],
    });

    const appA = new App(medplum, agentA.id, LogLevel.WARN);
    await appA.start();
    await waitFor(() => appA.isQueueLeader(), 5000, 'A acquires lease');

    const appB = new App(medplum, agentB.id, LogLevel.WARN);
    await appB.start();
    await waitFor(() => appB.isLive(), 5000, 'B live');
    // Exactly one leader during the overlap: A holds the lease, B parks as follower.
    expect(appA.isQueueLeader()).toBe(true);
    expect(appB.isQueueLeader()).toBe(false);

    // Source connects to B's listener (the process that survives the handoff).
    const client = new Hl7Client({ host: 'localhost', port: portB });
    for (const id of ['HO_1', 'HO_2', 'HO_3', 'HO_4']) {
      const ack = await client.sendAndWait(TEST_MSG(id), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
      expect(ack.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');
    }

    // A (leader) claims HO_1 and wedges on the withheld response; HO_2..4 queue
    // behind it (serial per channel). Only HO_1 is dispatched, by A. Wait on the
    // dispatch actually landing at the server — claimNext flips the row to
    // `processing` BEFORE the WS request goes out, so polling DB state alone races
    // the transmit.
    const queue = appB.getDurableQueue() as DurableQueue;
    await waitFor(() => transmits.length === 1, 5000, 'A dispatches HO_1');
    expect(transmits).toEqual(['HO_1']);
    expect(queue.countByState()).toMatchObject({ processing: 1, queued: 3 });

    // Stop the leader. Its in-flight HO_1 becomes `failed` (worker-stopped) and it
    // releases the lease on the way out. Now let the server answer.
    await appA.stop();
    respond = true;

    // B picks up the lease and drains the remaining backlog.
    await waitFor(() => appB.isQueueLeader(), 10000, 'B takes over the lease');
    await waitForRow(queue, (c) => c.processed === 3, 10000);

    // No double-processing and FIFO preserved: each control ID dispatched exactly
    // once — HO_1 by A (pre-handoff), HO_2..4 by B (post-handoff).
    expect(transmits).toEqual(['HO_1', 'HO_2', 'HO_3', 'HO_4']);

    // The interrupted row is parked for review; it owes no ACK and was not redrained.
    const ho1 = queue.findSeenByControlId('dq-test', 'HO_1');
    expect(ho1?.state).toBe('failed');
    expect(ho1?.errorCode).toBe('worker-stopped');
    expect(ho1?.ackOutcome).toBe('not_owed');

    // B completed the rest; the source never moved off B, so their ACKs delivered.
    for (const id of ['HO_2', 'HO_3', 'HO_4']) {
      const row = queue.findSeenByControlId('dq-test', id);
      expect(row?.state).toBe('processed');
      expect(row?.ackOutcome).toBe('delivered');
    }

    // Every message accounted for: 3 processed + 1 failed, nothing lost or stuck.
    expect(queue.countByState()).toMatchObject({
      processed: 3,
      failed: 1,
      queued: 0,
      processing: 0,
      nacked: 0,
      rejected: 0,
    });

    await client.close();
    await appB.stop();
  });

  // Slow-consumer retransmit storm: the downstream Bot is slow, so the source's
  // app-level ACK is delayed and it resends the SAME control ID several times while
  // the original is still in flight. Idempotent mode (the default) must absorb every
  // retransmit — one row, server sees the body exactly once — and still complete
  // normally once the slow response finally lands. Real-world trigger: a sender with
  // a tight ACK timeout hammering a backed-up interface. (The idempotent tests above
  // cover a single replay; this is the in-flight *storm* plus eventual completion,
  // exercising the active-window dedupe while the original has no server response.)
  test('slow-consumer retransmit storm: repeated in-flight retransmits dedupe to one row, server sees the body once', async () => {
    // Capture the first (and only) dispatched request but hold its response — we
    // release it by hand after the storm, so the timing is deterministic.
    const transmits: string[] = [];
    let firstTransmit:
      | { socket: Client; command: { channel: string; remote: string; callback: string; body: string } }
      | undefined;
    mockServer.on('connection', (socket) => {
      socket.on('message', (data) => {
        const command = JSON.parse((data as Buffer).toString('utf8'));
        if (command.type === 'agent:connect:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:connect:response' })));
          return;
        }
        if (command.type === 'agent:heartbeat:request') {
          socket.send(Buffer.from(JSON.stringify({ type: 'agent:heartbeat:response', version: MEDPLUM_VERSION })));
          return;
        }
        if (command.type === 'agent:transmit:request') {
          transmits.push(Hl7Message.parse(command.body).getSegment('MSH')?.getField(10)?.toString() ?? '');
          firstTransmit ??= { socket, command };
        }
      });
    });

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: join(dir, 'queue.sqlite') },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;
    const client = new Hl7Client({ host: 'localhost', port });

    // Original: CA at intake; the worker dispatches it and then waits (we hold the
    // response, simulating the slow downstream).
    const first = await client.sendAndWait(TEST_MSG('STORM'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(first.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');
    await waitFor(() => transmits.length === 1, 5000, 'original dispatched');
    expect(queue.countByState()).toMatchObject({ processing: 1, queued: 0 });

    // Storm: 3 retransmits of the SAME control ID while the original is in flight.
    // Each replays the commit ACK (CA) — none is enqueued or re-dispatched.
    for (let i = 0; i < 3; i++) {
      const replay = await client.sendAndWait(TEST_MSG('STORM'), {
        returnAck: ReturnAckCategory.FIRST,
        timeoutMs: 5000,
      });
      expect(replay.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');
    }
    // Still one row, still in flight, and the server saw the body exactly once.
    expect(queue.countByState()).toMatchObject({ processing: 1, queued: 0, processed: 0, nacked: 0 });
    expect(transmits).toEqual(['STORM']);

    // The slow consumer finally responds → the single row completes and delivers.
    const ft = firstTransmit as NonNullable<typeof firstTransmit>;
    const ack = Hl7Message.parse(ft.command.body).buildAck({ ackCode: 'AA' });
    ft.socket.send(
      Buffer.from(
        JSON.stringify({
          type: 'agent:transmit:response',
          channel: ft.command.channel,
          remote: ft.command.remote,
          callback: ft.command.callback,
          contentType: ContentType.HL7_V2,
          statusCode: 200,
          body: ack.toString(),
        } satisfies AgentTransmitResponse)
      )
    );

    await waitForRow(queue, (c) => c.processed === 1, 5000);
    expect(transmits).toEqual(['STORM']); // never re-dispatched, even after completion
    expect(queue.countByState()).toMatchObject({
      processed: 1,
      queued: 0,
      processing: 0,
      failed: 0,
      rejected: 0,
      nacked: 0,
    });
    expect(queue.findSeenByControlId('dq-test', 'STORM')?.ackOutcome).toBe('delivered');

    await client.close();
    await app.stop();
  });

  // App.stop() while a row is mid-dispatch: the worker settles the in-flight row to
  // `failed` (worker-stopped) on its way out rather than leaving it dangling in
  // `processing`. The message is preserved for operator review/replay — never lost,
  // never stuck. Real-world trigger: SIGTERM during a rolling restart while a message
  // is awaiting the Bot's response. (Distinct from `restart recovery`, where a hard
  // crash leaves a `processing` row that recoverOnStartup later promotes; here the
  // graceful stop settles the row itself, before the DB is even closed.)
  test('App.stop() settles an in-flight row to failed (worker-stopped), never left dangling in processing', async () => {
    startMockServer(() => undefined); // never respond — keep the row in flight

    const [endpoint, port] = await createEndpointWithRandomPort(medplum, {
      ...BASE_ENDPOINT,
      address: 'mllp://0.0.0.0:0?enhanced=true',
    });
    const dbPath = join(dir, 'queue.sqlite');
    const agent = await medplum.createResource<Agent>({
      resourceType: 'Agent',
      name: 'Durable Queue Test Agent',
      status: 'active',
      channel: [{ name: 'dq-test', endpoint: createReference(endpoint), targetReference: createReference(bot) }],
      setting: [
        { name: 'durableQueue', valueBoolean: true },
        { name: 'queueDbPath', valueString: dbPath },
      ],
    });
    const app = new App(medplum, agent.id, LogLevel.WARN);
    await app.start();
    const queue = app.getDurableQueue() as DurableQueue;
    const client = new Hl7Client({ host: 'localhost', port });

    const ack = await client.sendAndWait(TEST_MSG('DRAIN'), { returnAck: ReturnAckCategory.FIRST, timeoutMs: 5000 });
    expect(ack.getSegment('MSA')?.getField(1)?.toString()).toBe('CA');
    // Worker claims + dispatches it; it parks awaiting the response that never comes.
    await waitForRow(queue, (c) => c.processing === 1, 3000);

    // Graceful stop while in flight. stop() closes the queue handle, so inspect via
    // a fresh handle on the same DB (the row's disposition is durable on disk).
    await client.close();
    await app.stop();

    const reopened = DurableQueue.open({ path: dbPath, log: app.log });
    try {
      const row = reopened.findSeenByControlId('dq-test', 'DRAIN');
      // Settled by the worker on stop — not dangling in `processing`, not lost.
      expect(row?.state).toBe('failed');
      expect(row?.errorCode).toBe('worker-stopped');
      expect(row?.ackOutcome).toBe('not_owed');
      expect(reopened.countByState()).toMatchObject({ failed: 1, processing: 0, queued: 0 });
    } finally {
      reopened.close();
    }
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
  throw new Error(
    `waitForRow: predicate not satisfied after ${timeoutMs}ms; counts=${JSON.stringify(queue.countByState())}`
  );
}

/**
 * Polls an arbitrary predicate until it holds or the timeout elapses. Used for
 * non-queue conditions like WebSocket liveness.
 * @param predicate - Condition to wait for.
 * @param timeoutMs - Max time to wait before throwing.
 * @param label - Human-readable description for the timeout error.
 */
async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await sleep(25);
  }
  throw new Error(`waitFor: ${label} not satisfied after ${timeoutMs}ms`);
}

/**
 * Reads the `seq_no` of the most recent `nacked` audit row for a control ID.
 * {@link DurableQueue.findSeenByControlId} deliberately excludes `nacked` rows,
 * so audit-row assertions go straight through the raw handle.
 * @param queue - The queue to read from.
 * @param channelName - Channel the row belongs to.
 * @param msgControlId - MSH.10 to look up.
 * @returns The audit row's `seq_no` (which may be SQL NULL → `null`).
 * @throws If no `nacked` row exists for the control ID.
 */
/**
 * Reads the audit columns of the most recent `nacked` row for a control ID,
 * straight from the raw handle ({@link DurableQueue.findSeenByControlId} excludes
 * `nacked` rows, so it can't surface them).
 * @param queue - The queue to read from.
 * @param channelName - Channel the row belongs to.
 * @param msgControlId - MSH.10 to look up.
 * @returns The audit row's `error_code`, `ack_outcome`, and `state`.
 * @throws If no `nacked` row exists for the control ID.
 */
function nackedRow(
  queue: DurableQueue,
  channelName: string,
  msgControlId: string
): { error_code: string | null; ack_outcome: string; state: string } {
  const row = queue
    .getDb()
    .prepare(
      `SELECT error_code, ack_outcome, state FROM inbound_hl7_messages
        WHERE channel_name = ? AND msg_control_id = ? AND state = 'nacked'
        ORDER BY id DESC LIMIT 1`
    )
    .get(channelName, msgControlId) as
    | { error_code: string | null; ack_outcome: string; state: string }
    | undefined;
  if (!row) {
    throw new Error(`nackedRow: no nacked row for ${channelName}/${msgControlId}`);
  }
  return row;
}

function nackedSeqNo(queue: DurableQueue, channelName: string, msgControlId: string): number | null {
  const row = queue
    .getDb()
    .prepare(
      `SELECT seq_no FROM inbound_hl7_messages
        WHERE channel_name = ? AND msg_control_id = ? AND state = 'nacked'
        ORDER BY id DESC LIMIT 1`
    )
    .get(channelName, msgControlId) as { seq_no: number | null } | undefined;
  if (!row) {
    throw new Error(`nackedSeqNo: no nacked row for ${channelName}/${msgControlId}`);
  }
  return row.seq_no;
}
