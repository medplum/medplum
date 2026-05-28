// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLogger } from '../test-utils';
import { DurableQueue, isUniqueConstraintError } from './durable-queue';
import { MessageState } from './types';

function makeEnqueueInput(overrides: Partial<Parameters<DurableQueue['enqueue']>[0]> = {}): Parameters<
  DurableQueue['enqueue']
>[0] {
  return {
    channelName: 'ch1',
    remote: '127.0.0.1:5000',
    msgControlId: `MSG${Math.random().toString(36).slice(2, 9)}`,
    msgType: 'ADT^A01',
    body: Buffer.from('MSH|^~\\&|SND|FAC|...|2.5\rPID|...'),
    encoding: 'utf-8',
    enhancedMode: 'standard',
    callbackId: `cb-${Math.random().toString(36).slice(2, 9)}`,
    seqNo: null,
    receivedAt: Date.now(),
    ...overrides,
  };
}

describe('DurableQueue', () => {
  let dir: string;
  let queue: DurableQueue;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dq-test-'));
    dbPath = join(dir, 'queue.sqlite');
    queue = DurableQueue.open({ path: dbPath, log: createMockLogger() });
  });

  afterEach(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('opens, runs migrations, and creates the DB file', () => {
    expect(existsSync(dbPath)).toBe(true);
    // Calling open() again on the same path is a no-op for migrations (idempotency).
    const q2 = DurableQueue.open({ path: dbPath, log: createMockLogger() });
    q2.close();
  });

  test('enqueue inserts a queued row and round-trips a binary body', () => {
    const body = Buffer.from([0x4d, 0x53, 0x48, 0x00, 0xff, 0xfe]); // includes non-UTF-8 bytes
    const result = queue.enqueue(makeEnqueueInput({ msgControlId: 'MSG_BIN', body }));
    expect(result.kind).toBe('inserted');
    if (result.kind !== 'inserted') {
      throw new Error('unreachable');
    }
    expect(result.row.state).toBe(MessageState.QUEUED);
    expect(result.row.body.equals(body)).toBe(true);
    expect(result.row.committedAt).toBe(result.row.receivedAt);
    expect(result.row.attemptCount).toBe(0);
  });

  test('duplicate insert in active window returns duplicateActive with the prior row', () => {
    const r1 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP1', callbackId: 'cb-a' }));
    expect(r1.kind).toBe('inserted');
    const r2 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP1', callbackId: 'cb-b' }));
    expect(r2.kind).toBe('duplicateActive');
    if (r2.kind !== 'duplicateActive') {
      throw new Error('unreachable');
    }
    expect(r2.existing.callbackId).toBe('cb-a');
  });

  test('duplicate is permitted once the prior row is terminal (processed)', () => {
    const r1 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP2' }));
    if (r1.kind !== 'inserted') {throw new Error('expected inserted');}
    queue.markProcessed(r1.row.id);
    const r2 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP2', callbackId: 'cb-second' }));
    expect(r2.kind).toBe('inserted');
  });

  test('claimNext returns FIFO order per channel and ignores other channels', () => {
    const a = queue.enqueue(makeEnqueueInput({ channelName: 'A', msgControlId: 'A1' }));
    queue.enqueue(makeEnqueueInput({ channelName: 'B', msgControlId: 'B1' }));
    const a2 = queue.enqueue(makeEnqueueInput({ channelName: 'A', msgControlId: 'A2' }));

    const first = queue.claimNext('A');
    const second = queue.claimNext('A');
    const third = queue.claimNext('A');

    if (a.kind !== 'inserted' || a2.kind !== 'inserted') {throw new Error('expected inserted');}
    expect(first?.id).toBe(a.row.id);
    expect(first?.state).toBe(MessageState.PROCESSING);
    expect(first?.attemptCount).toBe(1);
    expect(second?.id).toBe(a2.row.id);
    expect(third).toBeNull();
  });

  test('claimNext returns null when no queued rows for the channel', () => {
    expect(queue.claimNext('nonexistent')).toBeNull();
  });

  test('markProcessed and markErrored set timestamps correctly', () => {
    const r = queue.enqueue(makeEnqueueInput({ msgControlId: 'TS1' }));
    if (r.kind !== 'inserted') {throw new Error('expected inserted');}
    const claimed = queue.claimNext(r.row.channelName);
    expect(claimed?.processingStartedAt).not.toBeNull();

    queue.markProcessed(r.row.id, 1700000000000);
    const after = queue.getById(r.row.id);
    expect(after?.state).toBe(MessageState.PROCESSED);
    expect(after?.processedAt).toBe(1700000000000);
    expect(after?.ackSentToSource).toBe(true);

    // markErrored on a separate row, to confirm it doesn't disturb the processed one.
    const r2 = queue.enqueue(makeEnqueueInput({ msgControlId: 'TS2' }));
    if (r2.kind !== 'inserted') {throw new Error('expected inserted');}
    queue.claimNext(r2.row.channelName);
    queue.markErrored(r2.row.id, 'boom', 1700000000123);
    expect(queue.getById(r2.row.id)?.state).toBe(MessageState.ERRORED);
    expect(queue.getById(r2.row.id)?.lastError).toBe('boom');
    expect(queue.getById(r2.row.id)?.erroredAt).toBe(1700000000123);

    // First row still processed, unaffected.
    expect(queue.getById(r.row.id)?.state).toBe(MessageState.PROCESSED);
  });

  test('recordServerResponse writes statusCode + body without changing state', () => {
    const r = queue.enqueue(makeEnqueueInput({ msgControlId: 'RSP1' }));
    if (r.kind !== 'inserted') {throw new Error('expected inserted');}
    queue.claimNext(r.row.channelName);

    queue.recordServerResponse(r.row.id, 201, 'response-body');
    const reread = queue.getById(r.row.id);
    expect(reread?.serverStatusCode).toBe(201);
    expect(reread?.serverResponseBody?.toString()).toBe('response-body');
    expect(reread?.state).toBe(MessageState.PROCESSING);
  });

  test('findByCallback locates the row by callback_id', () => {
    const r = queue.enqueue(makeEnqueueInput({ msgControlId: 'CB1', callbackId: 'find-me' }));
    if (r.kind !== 'inserted') {throw new Error('expected inserted');}
    const found = queue.findByCallback('find-me');
    expect(found?.id).toBe(r.row.id);
    expect(queue.findByCallback('nope')).toBeNull();
  });

  test('recoverOnStartup promotes processing rows to errored and leaves queued alone', () => {
    // Different channels so the claim picks the row we expect.
    const qrow = queue.enqueue(makeEnqueueInput({ channelName: 'Q', msgControlId: 'Q1' }));
    const prow = queue.enqueue(makeEnqueueInput({ channelName: 'P', msgControlId: 'P1' }));
    if (prow.kind !== 'inserted') {throw new Error('expected inserted');}
    queue.claimNext('P'); // P → processing

    const promoted = queue.recoverOnStartup(1700000000000);
    expect(promoted).toBe(1);
    expect(queue.getById(prow.row.id)?.state).toBe(MessageState.ERRORED);
    expect(queue.getById(prow.row.id)?.lastError).toContain('interrupted');
    if (qrow.kind !== 'inserted') {throw new Error('expected inserted');}
    expect(queue.getById(qrow.row.id)?.state).toBe(MessageState.QUEUED);

    // Re-running is a no-op now that no rows are in processing.
    expect(queue.recoverOnStartup()).toBe(0);
  });

  test('enqueueRejected creates a nacked audit row with last_error and ack_sent_to_source=1', () => {
    const row = queue.enqueueRejected({
      ...makeEnqueueInput({ msgControlId: 'NACK1' }),
      lastError: 'duplicate control id',
    });
    expect(row?.state).toBe(MessageState.NACKED);
    expect(row?.lastError).toBe('duplicate control id');
    expect(row?.ackSentToSource).toBe(true);
    expect(row?.committedAt).toBeNull();
  });

  test('countByState reports correct totals across states', () => {
    const a = queue.enqueue(makeEnqueueInput({ msgControlId: 'CB-A' }));
    const b = queue.enqueue(makeEnqueueInput({ msgControlId: 'CB-B' }));
    if (a.kind !== 'inserted' || b.kind !== 'inserted') {throw new Error('expected inserted');}
    queue.claimNext(a.row.channelName); // a → processing
    queue.markProcessed(a.row.id);
    queue.claimNext(b.row.channelName); // b → processing
    queue.markErrored(b.row.id, 'x');
    queue.enqueueRejected({ ...makeEnqueueInput({ msgControlId: 'CB-N' }), lastError: 'dup' });

    expect(queue.countByState()).toEqual({
      queued: 0,
      processing: 0,
      processed: 1,
      errored: 1,
      nacked: 1,
    });
  });

  test('getChannelDepth reports queued/processing/oldest age', () => {
    const t0 = Date.now();
    queue.enqueue(makeEnqueueInput({ channelName: 'D', msgControlId: 'D1', receivedAt: t0 - 5000 }));
    queue.enqueue(makeEnqueueInput({ channelName: 'D', msgControlId: 'D2', receivedAt: t0 - 1000 }));

    const depth = queue.getChannelDepth('D', t0);
    expect(depth.queued).toBe(2);
    expect(depth.processing).toBe(0);
    expect(depth.oldestQueuedAgeMs).toBe(5000);

    queue.claimNext('D');
    const depth2 = queue.getChannelDepth('D', t0);
    expect(depth2.queued).toBe(1);
    expect(depth2.processing).toBe(1);
  });

  test('listQueuedIdsForChannel returns FIFO ordered IDs', () => {
    const r1 = queue.enqueue(makeEnqueueInput({ channelName: 'L', msgControlId: 'L1' }));
    const r2 = queue.enqueue(makeEnqueueInput({ channelName: 'L', msgControlId: 'L2' }));
    queue.enqueue(makeEnqueueInput({ channelName: 'OTHER', msgControlId: 'X' }));
    if (r1.kind !== 'inserted' || r2.kind !== 'inserted') {throw new Error('expected inserted');}
    expect(queue.listQueuedIdsForChannel('L')).toEqual([r1.row.id, r2.row.id]);
  });

  test('migration is idempotent across reopens (no duplicate _schema rows)', () => {
    queue.close();
    queue = DurableQueue.open({ path: dbPath, log: createMockLogger() });
    queue = (() => {
      const db = queue.getDb();
      const row = db.prepare('SELECT COUNT(*) AS n FROM _schema WHERE version = 1').get() as { n: number };
      expect(row.n).toBe(1);
      return queue;
    })();
  });

  describe('lease', () => {
    test('tryAcquireLease succeeds against an empty table', () => {
      const ok = queue.tryAcquireLease('holder-A', 30_000, 1_700_000_000_000);
      expect(ok).toBe(true);
      const lease = queue.getCurrentLease();
      expect(lease?.holder).toBe('holder-A');
      expect(lease?.expiresAt).toBe(1_700_000_030_000);
    });

    test('tryAcquireLease fails when a different holder still has a valid lease', () => {
      queue.tryAcquireLease('holder-A', 30_000, 1_700_000_000_000);
      const ok = queue.tryAcquireLease('holder-B', 30_000, 1_700_000_005_000); // 5s into A's lease
      expect(ok).toBe(false);
      expect(queue.getCurrentLease()?.holder).toBe('holder-A');
    });

    test('tryAcquireLease takes over when the prior lease has expired', () => {
      queue.tryAcquireLease('holder-A', 30_000, 1_700_000_000_000);
      // Past A's expiry.
      const ok = queue.tryAcquireLease('holder-B', 30_000, 1_700_000_031_000);
      expect(ok).toBe(true);
      expect(queue.getCurrentLease()?.holder).toBe('holder-B');
    });

    test('tryAcquireLease is idempotent for the same holder (re-acquire extends TTL)', () => {
      queue.tryAcquireLease('holder-A', 30_000, 1_700_000_000_000);
      const ok = queue.tryAcquireLease('holder-A', 30_000, 1_700_000_005_000);
      expect(ok).toBe(true);
      expect(queue.getCurrentLease()?.expiresAt).toBe(1_700_000_035_000);
    });

    test('heartbeatLease extends our own lease', () => {
      queue.tryAcquireLease('holder-A', 30_000, 1_700_000_000_000);
      const ok = queue.heartbeatLease('holder-A', 30_000, 1_700_000_010_000);
      expect(ok).toBe(true);
      expect(queue.getCurrentLease()?.expiresAt).toBe(1_700_000_040_000);
    });

    test('heartbeatLease fails after a peer has taken over', () => {
      queue.tryAcquireLease('holder-A', 30_000, 1_700_000_000_000);
      // Peer takes over after expiry.
      queue.tryAcquireLease('holder-B', 30_000, 1_700_000_031_000);
      // A tries to heartbeat — should fail.
      const ok = queue.heartbeatLease('holder-A', 30_000, 1_700_000_032_000);
      expect(ok).toBe(false);
      expect(queue.getCurrentLease()?.holder).toBe('holder-B');
    });

    test('releaseLease removes only our row', () => {
      queue.tryAcquireLease('holder-A', 30_000, 1_700_000_000_000);
      // A wrong-holder release is a no-op.
      queue.releaseLease('holder-B');
      expect(queue.getCurrentLease()?.holder).toBe('holder-A');
      // The right one clears it.
      queue.releaseLease('holder-A');
      expect(queue.getCurrentLease()).toBeNull();
    });

    test('getCurrentLease returns null when no lease has been acquired', () => {
      expect(queue.getCurrentLease()).toBeNull();
    });
  });

  test('isUniqueConstraintError detects the expected error shapes', () => {
    expect(isUniqueConstraintError(new Error('UNIQUE constraint failed: foo'))).toBe(true);
    const err = new Error('boom') as Error & { code?: string };
    err.code = 'ERR_SQLITE_CONSTRAINT_UNIQUE';
    expect(isUniqueConstraintError(err)).toBe(true);
    expect(isUniqueConstraintError(new Error('something else'))).toBe(false);
    expect(isUniqueConstraintError('not an error')).toBe(false);
  });
});
