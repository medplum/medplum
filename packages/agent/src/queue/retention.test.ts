// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLogger } from '../test-utils';
import { DurableQueue } from './durable-queue';
import { RetentionSweeper } from './retention';
import { MessageState } from './types';

/**
 * Seed a row in the chosen state with a specific terminal timestamp.
 * @param queue - Open queue to seed.
 * @param state - Terminal state to land the row in.
 * @param terminalAt - Timestamp to write to the terminal-state column.
 * @param msgControlId - MSH.10 to use (also baked into the callback ID).
 * @param ackOutcome - Source-leg outcome; defaults to `delivered` for processed
 *   rows (fully done) and `not_owed` otherwise. Pass `undelivered` to seed the
 *   processed-but-ACK-failed cell that the retention floor must protect.
 * @returns The inserted row's primary key.
 */
function seedRow(
  queue: DurableQueue,
  state: 'processed' | 'rejected' | 'failed' | 'nacked',
  terminalAt: number,
  msgControlId: string,
  ackOutcome: 'delivered' | 'undelivered' | 'not_owed' = state === 'processed' ? 'delivered' : 'not_owed'
): number {
  const r = queue.enqueue({
    channelName: 'ch1',
    remote: '127.0.0.1:5000',
    msgControlId,
    msgType: 'ADT^A01',
    originalMessage: Buffer.from('seed-body'),
    finalizedMessage: Buffer.from('seed-body'),
    encoding: 'utf-8',
    enhancedMode: 'standard',
    callbackId: `cb-${msgControlId}`,
    seqNo: null,
    receivedAt: terminalAt - 1000,
  });
  if (r.kind !== 'inserted') {
    throw new Error('seedRow: enqueue failed');
  }
  const db = queue.getDb();
  if (state === 'processed') {
    db.prepare(
      `UPDATE inbound_hl7_messages SET state = 'processed', ack_outcome = ?, processed_at = ? WHERE id = ?`
    ).run(ackOutcome, terminalAt, r.row.id);
  } else {
    db.prepare(`UPDATE inbound_hl7_messages SET state = ?, ack_outcome = ?, errored_at = ? WHERE id = ?`).run(
      state,
      ackOutcome,
      terminalAt,
      r.row.id
    );
  }
  return r.row.id;
}

describe('RetentionSweeper', () => {
  let dir: string;
  let queue: DurableQueue;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-test-'));
    queue = DurableQueue.open({ path: join(dir, 'queue.sqlite'), log: createMockLogger() });
  });

  afterEach(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('time-based purge deletes only processed rows older than retentionDays', async () => {
    const now = 1_700_000_000_000;
    const dayMs = 86_400_000;
    seedRow(queue, 'processed', now - 10 * dayMs, 'OLD_P');
    seedRow(queue, 'processed', now - 1 * dayMs, 'YOUNG_P');
    seedRow(queue, 'failed', now - 10 * dayMs, 'OLD_E'); // should be spared by phase 1

    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 7,
      maxSizeMb: 1024, // huge so phase 2 doesn't fire
      erroredRetentionDays: 90,
    });
    const result = await sweeper.sweep(now);
    expect(result.deletedProcessed).toBe(1);
    expect(result.deletedErrored).toBe(0);

    const counts = queue.countByState();
    expect(counts.processed).toBe(1);
    expect(counts.failed).toBe(1);
  });

  test('time-based purge spares processed rows whose ACK is still undelivered', async () => {
    const now = 1_700_000_000_000;
    const dayMs = 86_400_000;
    // Both are old enough for the processed window, but the undelivered one is
    // not "fully done" — it must survive (source may still retransmit, and it's
    // an operator signal). The delivered one is purged.
    seedRow(queue, 'processed', now - 10 * dayMs, 'OLD_DELIVERED', 'delivered');
    const undeliveredId = seedRow(queue, 'processed', now - 10 * dayMs, 'OLD_UNDELIVERED', 'undelivered');

    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 7,
      maxSizeMb: 1024, // huge so the floor purge (phase 3) never fires
      erroredRetentionDays: 90,
    });
    const result = await sweeper.sweep(now);
    expect(result.deletedProcessed).toBe(1); // only the delivered one
    expect(queue.getById(undeliveredId)?.state).toBe(MessageState.PROCESSED);
    expect(queue.getById(undeliveredId)?.ackOutcome).toBe('undelivered');
  });

  test('size-driven purge deletes oldest processed first', async () => {
    const now = 1_700_000_000_000;
    // Seed many young processed rows so phase 1 can't remove them.
    for (let i = 0; i < 50; i++) {
      seedRow(queue, 'processed', now - 60_000 - i, `P${i}`);
    }
    // 1 byte budget — every byte counts, anything triggers purge.
    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 365 * 10, // big — phase 1 spares everything
      maxSizeMb: 0, // 0 MiB → 0 byte budget → phase 2 deletes until empty of processed
      erroredRetentionDays: 90,
    });
    const result = await sweeper.sweep(now);
    expect(result.deletedProcessed).toBeGreaterThan(0);
    expect(queue.countByState().processed).toBeLessThan(50);
  });

  test('errored floor protects failed rows from size-driven sweep', async () => {
    const now = 1_700_000_000_000;
    const dayMs = 86_400_000;
    // Young failed — protected by the floor regardless of size pressure.
    const errYoungId = seedRow(queue, 'failed', now - 1 * dayMs, 'EY');
    // No processed rows at all, just to make sure phase 2 hits nothing then phase 3 runs.
    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 365 * 10,
      maxSizeMb: 0,
      erroredRetentionDays: 90, // EY is only 1 day old → still protected
    });
    await sweeper.sweep(now);
    expect(queue.getById(errYoungId)?.state).toBe(MessageState.FAILED);
  });

  test('errored floor also protects young processed+undelivered rows under size pressure', async () => {
    const now = 1_700_000_000_000;
    const dayMs = 86_400_000;
    // Old enough for the processed window but young vs the errored floor — the
    // floor (keyed on processed_at via COALESCE) must keep it.
    const undeliveredId = seedRow(queue, 'processed', now - 10 * dayMs, 'YOUNG_UNDELIVERED', 'undelivered');
    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 7,
      maxSizeMb: 0, // max size pressure
      erroredRetentionDays: 90, // 10 days old → still inside the floor
    });
    await sweeper.sweep(now);
    expect(queue.getById(undeliveredId)?.state).toBe(MessageState.PROCESSED);
    expect(queue.getById(undeliveredId)?.ackOutcome).toBe('undelivered');
  });

  test('failed older than floor is purged under size pressure', async () => {
    const now = 1_700_000_000_000;
    const dayMs = 86_400_000;
    seedRow(queue, 'failed', now - 100 * dayMs, 'EOLD'); // past the floor
    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 365 * 10,
      maxSizeMb: 0,
      erroredRetentionDays: 90,
    });
    const result = await sweeper.sweep(now);
    expect(result.deletedErrored).toBeGreaterThanOrEqual(1);
  });

  test('processed+undelivered older than floor is purged under size pressure', async () => {
    const now = 1_700_000_000_000;
    const dayMs = 86_400_000;
    // Past both the processed window (spared by phase 1) and the errored floor.
    seedRow(queue, 'processed', now - 100 * dayMs, 'POLD_UNDELIVERED', 'undelivered');
    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 7,
      maxSizeMb: 0,
      erroredRetentionDays: 90,
    });
    const result = await sweeper.sweep(now);
    expect(result.deletedErrored).toBeGreaterThanOrEqual(1);
    expect(queue.countByState().processed).toBe(0);
  });

  test('sweep is a no-op when below thresholds', async () => {
    const now = 1_700_000_000_000;
    seedRow(queue, 'processed', now - 1000, 'FRESH');
    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 7,
      maxSizeMb: 1024,
      erroredRetentionDays: 90,
    });
    const result = await sweeper.sweep(now);
    expect(result.deletedProcessed).toBe(0);
    expect(result.deletedErrored).toBe(0);
    expect(queue.countByState().processed).toBe(1);
  });

  test('start() runs a sweep immediately, not only after the first interval', () => {
    const dayMs = 86_400_000;
    seedRow(queue, 'processed', Date.now() - 100 * dayMs, 'STARTUP_SWEEP');
    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 7,
      maxSizeMb: 1024,
      erroredRetentionDays: 90,
      sweepIntervalSecs: 3600,
    });
    sweeper.start();
    try {
      // sweep() has no internal awaits, so the startup sweep completes
      // synchronously within start() — no need to wait for the interval.
      expect(queue.countByState().processed).toBe(0);
      expect(sweeper.getLastSweepAt()).not.toBeNull();
    } finally {
      sweeper.stop();
    }
  });

  test('sweep is synchronous and returns a plain SweepResult, not a Promise', () => {
    // Regression: sweep() was declared `async` despite containing no `await`
    // (every SQLite call is synchronous). Keeping it non-async guarantees the
    // `running` re-entrancy guard can't be defeated by a future mid-sweep await.
    const now = 1_700_000_000_000;
    seedRow(queue, 'processed', now - 1000, 'SYNC_SWEEP');
    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 7,
      maxSizeMb: 1024,
      erroredRetentionDays: 90,
    });
    const result = sweeper.sweep(now);
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof (result as { then?: unknown }).then).toBe('undefined');
    expect(result.deletedProcessed).toBe(0);
  });

  test('start/stop are idempotent', () => {
    const sweeper = new RetentionSweeper({ queue, log: createMockLogger(), sweepIntervalSecs: 3600 });
    sweeper.start();
    sweeper.start(); // no-op
    sweeper.stop();
    sweeper.stop(); // no-op
  });
});
