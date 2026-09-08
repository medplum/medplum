// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { sleep, TypedEventTarget } from '@medplum/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { App } from '../app';
import { createMockLogger, waitFor } from '../test-utils';
import { ChannelDispatcher } from './dispatcher';
import { DurableQueue } from './durable-queue';
import type { InboundRow } from './types';
import { AckOutcome, MessageState, QueueLeaseError } from './types';
import type { ChannelQueueWorker } from './worker';

/**
 * A stand-in for {@link ChannelQueueWorker} exposing only the two methods the
 * dispatcher uses. Real slots would drag in the whole dispatch/settle path and an
 * App to transmit through; these tests are about what the dispatcher claims and
 * who it hands it to, so a fake keeps each assertion about exactly that.
 */
class FakeSlot {
  readonly assigned: InboundRow[] = [];
  busy = false;

  isFree(): boolean {
    return !this.busy;
  }

  assign(row: InboundRow): void {
    this.assigned.push(row);
    // A real slot holds the row until its server round trip settles.
    this.busy = true;
  }

  /** Settles whatever this slot is holding, freeing it for the next claim. */
  release(): void {
    this.busy = false;
  }
}

/**
 * @param count - How many slots the pool holds.
 * @returns The fake slots, plus the getter the dispatcher reads them through.
 */
function makePool(count: number): { slots: FakeSlot[]; workers: () => ChannelQueueWorker[] } {
  const slots = Array.from({ length: count }, () => new FakeSlot());
  return { slots, workers: () => slots as unknown as ChannelQueueWorker[] };
}

/**
 * @param live - Initial `isLive()` result.
 * @returns A minimal App stub — the dispatcher only ever asks whether the server
 * connection is up.
 */
function makeStubApp(live = true): { app: App; setLive: (value: boolean) => void } {
  let isLive = live;
  const stub = {
    isLive: () => isLive,
    heartbeatEmitter: new TypedEventTarget(),
  };
  return { app: stub as unknown as App, setLive: (value: boolean) => (isLive = value) };
}

describe('ChannelDispatcher', () => {
  let dir: string;
  let queue: DurableQueue;
  let dispatchers: ChannelDispatcher[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'disp-test-'));
    queue = DurableQueue.open({ path: join(dir, 'queue.sqlite'), log: createMockLogger() });
    dispatchers = [];
  });

  afterEach(async () => {
    // Stop before closing: a live dispatcher claims against the queue, and its
    // per-iteration error handling would keep it looping over a closed database.
    await Promise.allSettled(dispatchers.map((dispatcher) => dispatcher.stop()));
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function enqueueOne(callbackId: string, body = 'MSH|^~\\&|...|2.5\r'): InboundRow {
    const result = queue.enqueue({
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
    if (result.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    return result.row;
  }

  function start(
    workers: () => ChannelQueueWorker[],
    options?: {
      app?: App;
      computeKey?: (message: Buffer) => string;
      idlePollMs?: number;
      log?: ReturnType<typeof createMockLogger>;
    }
  ): ChannelDispatcher {
    const dispatcher = new ChannelDispatcher({
      channelName: 'ch1',
      app: options?.app ?? makeStubApp().app,
      queue,
      log: options?.log ?? createMockLogger(),
      workers,
      computeKey: options?.computeKey,
      idlePollMs: options?.idlePollMs ?? 10,
    });
    dispatcher.start();
    dispatchers.push(dispatcher);
    return dispatcher;
  }

  test('claim cost does not scale with pool size', async () => {
    // The reason this class exists. Every worker used to claim for itself and be
    // broadcast-woken on every enqueue and every settle, so one row cost the pool
    // ~N claims — all but one of them returning nothing, each a synchronous SQLite
    // statement on the thread serving the MLLP sockets. One claimer makes that cost
    // a property of the work, not of `maxWorkers`.
    async function claimsToDispatchOneRow(poolSize: number): Promise<number> {
      const row = enqueueOne(`SCALE-${poolSize}`);
      const { slots, workers } = makePool(poolSize);
      const claimNext = vi.spyOn(queue, 'claimNext');
      // No idle poll within the test's lifetime, so the count reflects event-driven
      // claims alone rather than however many times the poll happened to fire.
      const dispatcher = start(workers, { idlePollMs: 60_000 });
      await waitFor(() => slots.some((slot) => slot.assigned.length > 0), 2000, `pool ${poolSize} dispatched`);
      await dispatcher.stop();

      expect(slots.flatMap((slot) => slot.assigned).map((r) => r.id)).toStrictEqual([row.id]);
      const calls = claimNext.mock.calls.length;
      claimNext.mockRestore();
      // Settle it so the next pool size starts from an empty queue.
      queue.markProcessed(row.id, 1, AckOutcome.DELIVERED);
      return calls;
    }

    // Two claims either way: the one that returns the row, and the one that finds
    // the queue empty and puts the loop to sleep.
    expect(await claimsToDispatchOneRow(2)).toBe(2);
    expect(await claimsToDispatchOneRow(64)).toBe(2);
  });

  test('fills every free slot, then waits', async () => {
    const rows = ['F1', 'F2', 'F3', 'F4', 'F5'].map((id) => enqueueOne(id, `MSH|${id}\r`));
    const { slots, workers } = makePool(3);
    // One partition per message: with the default single '' partition every row
    // would serialize behind the last, which is a different test (see below).
    start(workers, { computeKey: (message) => message.toString('utf8') });

    await waitFor(() => slots.every((slot) => slot.assigned.length === 1), 2000, 'pool filled');
    // Each slot holds exactly one row, and the surplus stays durably queued rather
    // than being claimed with nowhere to run.
    expect(slots.flatMap((slot) => slot.assigned)).toHaveLength(3);
    expect(rows.filter((r) => queue.getById(r.id)?.state === MessageState.QUEUED)).toHaveLength(2);

    // Freeing one slot lets exactly one more row through.
    slots[0].release();
    await waitFor(() => slots[0].assigned.length === 2, 2000, 'freed slot refilled');
    expect(rows.filter((r) => queue.getById(r.id)?.state === MessageState.QUEUED)).toHaveLength(1);
  });

  test('parks a row whose logical channel is already in flight', async () => {
    const r1 = enqueueOne('P1');
    const r2 = enqueueOne('P2');
    const { slots, workers } = makePool(2);
    // Every row collapses into one partition, so r2 must wait for r1.
    start(workers, { computeKey: () => 'K' });

    await waitFor(() => queue.getById(r2.id)?.state === MessageState.DELAYED, 2000, 'follower parked');
    expect(queue.getById(r1.id)?.state).toBe(MessageState.CLAIMED);
    // Only the head was handed out; the second slot stayed idle rather than
    // dispatching the same logical channel concurrently.
    expect(slots.flatMap((slot) => slot.assigned).map((r) => r.id)).toStrictEqual([r1.id]);
    // Parking undoes the claim's attempt bump — the row never dispatched.
    expect(queue.getById(r2.id)?.attemptCount).toBe(0);
  });

  test('does not claim while the server connection is down', async () => {
    const row = enqueueOne('OFF1');
    const { app, setLive } = makeStubApp(false);
    const { slots, workers } = makePool(1);
    start(workers, { app });

    // Several idle-poll intervals: the row must still be sitting there untouched,
    // not merely not-yet-claimed.
    await sleep(50);
    expect(slots[0].assigned).toHaveLength(0);
    expect(queue.getById(row.id)?.state).toBe(MessageState.QUEUED);
    expect(queue.getById(row.id)?.attemptCount).toBe(0);

    setLive(true);
    await waitFor(() => slots[0].assigned.length === 1, 2000, 'dispatched on reconnect');
  });

  test('holds off while the channel claim mutex is up', async () => {
    const row = enqueueOne('MX1');
    const paused = vi.spyOn(queue, 'isClaimPaused').mockReturnValue(true);
    const { slots, workers } = makePool(1);
    start(workers);

    await waitFor(() => paused.mock.calls.length > 0, 1000, 'mutex consulted');
    expect(slots[0].assigned).toHaveLength(0);
    expect(queue.getById(row.id)?.state).toBe(MessageState.QUEUED);

    paused.mockReturnValue(false);
    await waitFor(() => slots[0].assigned.length === 1, 2000, 'claiming resumed');
  });

  test('steps down when a peer takes the queue lease', async () => {
    expect(queue.tryAcquireLease('us', 60_000)).toBe(true);
    enqueueOne('LD1');
    const { workers } = makePool(1);
    const dispatcher = start(workers);

    queue.releaseLease('us');
    expect(queue.tryAcquireLease('peer', 60_000)).toBe(true);
    await waitFor(() => !dispatcher.isRunning(), 2000, 'stepped down');

    // A row enqueued after the steal is never claimed by the demoted dispatcher.
    const r2 = enqueueOne('LD2');
    dispatcher.notify();
    await sleep(50);
    expect(queue.getById(r2.id)?.state).toBe(MessageState.QUEUED);
  });

  test('a slot reporting lease loss stops claiming', async () => {
    enqueueOne('SL1');
    const { workers } = makePool(1);
    const dispatcher = start(workers);
    expect(dispatcher.isRunning()).toBe(true);

    dispatcher.onSlotLeaseLost();
    await waitFor(() => !dispatcher.isRunning(), 2000, 'stepped down from slot report');
  });

  test('keeps claiming after a non-lease error on one row', async () => {
    // One claimer for the whole channel means an unhandled error would stop the
    // channel outright, so a bad row must cost that row and nothing more.
    enqueueOne('ERR1');
    const good = enqueueOne('ERR2');
    const log = createMockLogger();
    const { slots, workers } = makePool(1);
    let thrown = false;
    vi.spyOn(queue, 'isPartitionBlocked').mockImplementation(() => {
      if (!thrown) {
        thrown = true;
        throw new Error('boom');
      }
      return false;
    });
    start(workers, { log });

    await waitFor(() => slots[0].assigned.length === 1, 2000, 'recovered and dispatched the next row');
    expect(slots[0].assigned[0].id).toBe(good.id);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('boom'), expect.anything());
  });

  test('a lease error thrown by the partition gate steps down rather than continuing', async () => {
    enqueueOne('LG1');
    const { workers } = makePool(1);
    vi.spyOn(queue, 'isPartitionBlocked').mockImplementation(() => {
      throw new QueueLeaseError(undefined, 'peer');
    });
    const dispatcher = start(workers);

    await waitFor(() => !dispatcher.isRunning(), 2000, 'stepped down');
  });
});
