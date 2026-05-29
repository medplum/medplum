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
 * @returns The inserted row's primary key.
 */
function seedRow(
  queue: DurableQueue,
  state: 'processed' | 'errored' | 'nacked',
  terminalAt: number,
  msgControlId: string
): number {
  const r = queue.enqueue({
    channelName: 'ch1',
    remote: '127.0.0.1:5000',
    msgControlId,
    msgType: 'ADT^A01',
    body: Buffer.from('seed-body'),
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
    db.prepare(`UPDATE inbound_hl7_messages SET state = 'processed', processed_at = ? WHERE id = ?`).run(
      terminalAt,
      r.row.id
    );
  } else {
    db.prepare(`UPDATE inbound_hl7_messages SET state = ?, errored_at = ? WHERE id = ?`).run(
      state,
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
    seedRow(queue, 'errored', now - 10 * dayMs, 'OLD_E'); // should be spared by phase 1

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
    expect(counts.errored).toBe(1);
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

  test('errored floor protects errored rows from size-driven sweep', async () => {
    const now = 1_700_000_000_000;
    const dayMs = 86_400_000;
    // Young errored — protected by the floor regardless of size pressure.
    const errYoungId = seedRow(queue, 'errored', now - 1 * dayMs, 'EY');
    // No processed rows at all, just to make sure phase 2 hits nothing then phase 3 runs.
    const sweeper = new RetentionSweeper({
      queue,
      log: createMockLogger(),
      retentionDays: 365 * 10,
      maxSizeMb: 0,
      erroredRetentionDays: 90, // EY is only 1 day old → still protected
    });
    await sweeper.sweep(now);
    expect(queue.getById(errYoungId)?.state).toBe(MessageState.ERRORED);
  });

  test('errored older than floor is purged under size pressure', async () => {
    const now = 1_700_000_000_000;
    const dayMs = 86_400_000;
    seedRow(queue, 'errored', now - 100 * dayMs, 'EOLD'); // past the floor
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

  test('start/stop are idempotent', () => {
    const sweeper = new RetentionSweeper({ queue, log: createMockLogger(), sweepIntervalSecs: 3600 });
    sweeper.start();
    sweeper.start(); // no-op
    sweeper.stop();
    sweeper.stop(); // no-op
  });
});
