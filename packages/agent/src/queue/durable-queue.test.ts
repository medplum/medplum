// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createMockLogger } from '../test-utils';
import { DurableQueue, isUniqueConstraintError } from './durable-queue';
import { MIGRATIONS } from './schema';
import { AckOutcome, assertRowState, MessageState, QueueErrorCode } from './types';

function makeEnqueueInput(
  overrides: Partial<Parameters<DurableQueue['enqueue']>[0]> = {}
): Parameters<DurableQueue['enqueue']>[0] {
  return {
    channelName: 'ch1',
    remote: '127.0.0.1:5000',
    msgControlId: `MSG${Math.random().toString(36).slice(2, 9)}`,
    msgType: 'ADT^A01',
    originalMessage: Buffer.from('MSH|^~\\&|SND|FAC|...|2.5\rPID|...'),
    finalizedMessage: Buffer.from('MSH|^~\\&|SND|FAC|...|2.5\rPID|...'),
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

  // Reads a raw column straight from SQLite. Used to assert that a state
  // transition cleared a lifecycle column (e.g. scheduleRetry nulling sent_at)
  // in cases where that column is now structurally absent from the state's
  // InboundRow member, so it can't be read through the typed row.
  function rawColumn(id: number, column: string): unknown {
    const row = queue.getDb().prepare(`SELECT ${column} AS v FROM inbound_hl7_messages WHERE id = ?`).get(id) as
      | { v: unknown }
      | undefined;
    return row?.v ?? null;
  }

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

  // Guards the ordering contract behind our "cheap ADD COLUMN" claim in
  // schema.ts: the schema (all migrations) must be fully applied before we ever
  // write a data row. If a refactor reordered the constructor to prepare/execute
  // a data-table write before runMigrations(), a migration that reshapes
  // inbound_hl7_messages could see rows that shouldn't exist yet (or fail
  // outright). This asserts every migration's `_schema` version row is inserted
  // before the first INSERT INTO inbound_hl7_messages.
  test('does not write any data row until all migrations have run', () => {
    // Record the SQL of every statement executed against the DB, in order.
    const events: { op: string; sql: string }[] = [];
    const rawDb = new DatabaseSync(':memory:');
    const db = new Proxy(rawDb, {
      get(target, prop, receiver) {
        if (prop === 'exec') {
          return (sql: string) => {
            events.push({ op: 'exec', sql });
            return target.exec(sql);
          };
        }
        if (prop === 'prepare') {
          return (sql: string) => {
            const stmt = target.prepare(sql);
            return new Proxy(stmt, {
              get(st, p) {
                const orig = Reflect.get(st, p, st);
                if (typeof orig === 'function' && (p === 'run' || p === 'get' || p === 'all')) {
                  return (...args: unknown[]) => {
                    events.push({ op: String(p), sql });
                    return (orig as (...a: unknown[]) => unknown).apply(st, args);
                  };
                }
                return typeof orig === 'function' ? orig.bind(st) : orig;
              },
            });
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as unknown as DatabaseSync;

    // Bare constructor (no timers) — runs pragmas + migrations, then enqueue writes a row.
    const q = new DurableQueue(db, { path: ':memory:', log: createMockLogger() });
    q.enqueue(makeEnqueueInput());

    // Every migration records its version into _schema; there must be one per migration.
    const schemaInsertIdxs = events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.op === 'run' && /INSERT INTO _schema/i.test(e.sql))
      .map(({ i }) => i);
    expect(schemaInsertIdxs).toHaveLength(MIGRATIONS.length);

    // The first data-row write must come strictly after the last migration commits.
    const firstDataWriteIdx = events.findIndex((e) => /INSERT INTO inbound_hl7_messages/i.test(e.sql));
    expect(firstDataWriteIdx).toBeGreaterThan(-1);
    expect(firstDataWriteIdx).toBeGreaterThan(Math.max(...schemaInsertIdxs));

    q.close();
  });

  test('enqueue inserts a queued row and round-trips a binary body', () => {
    const body = Buffer.from([0x4d, 0x53, 0x48, 0x00, 0xff, 0xfe]); // includes non-UTF-8 bytes
    const result = queue.enqueue(
      makeEnqueueInput({ msgControlId: 'MSG_BIN', originalMessage: body, finalizedMessage: body })
    );
    expect(result.kind).toBe('inserted');
    if (result.kind !== 'inserted') {
      throw new Error('unreachable');
    }
    expect(result.row.state).toBe(MessageState.QUEUED);
    expect(result.row.originalMessage.equals(body)).toBe(true);
    expect(result.row.finalizedMessage.equals(body)).toBe(true);
    expect(result.row.attemptCount).toBe(0);
  });

  test('duplicate insert in active window returns duplicate with the prior row', () => {
    const r1 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP1', callbackId: 'cb-a' }));
    expect(r1.kind).toBe('inserted');
    const r2 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP1', callbackId: 'cb-b' }));
    expect(r2.kind).toBe('duplicate');
    if (r2.kind !== 'duplicate') {
      throw new Error('unreachable');
    }
    expect(r2.existing.callbackId).toBe('cb-a');
  });

  test('duplicate is detected even once the prior row is terminal (processed)', () => {
    const r1 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP2', callbackId: 'cb-first' }));
    if (r1.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    queue.markProcessed(r1.row.id, AckOutcome.DELIVERED);
    const r2 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP2', callbackId: 'cb-second' }));
    expect(r2.kind).toBe('duplicate');
    if (r2.kind !== 'duplicate') {
      throw new Error('unreachable');
    }
    expect(r2.existing.callbackId).toBe('cb-first');
    expect(r2.existing.state).toBe(MessageState.PROCESSED);
  });

  test('duplicate is detected once the prior row is terminal (failed)', () => {
    const r1 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP3', callbackId: 'cb-err' }));
    if (r1.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    queue.claimNext(r1.row.channelName);
    queue.markFailed(r1.row.id, 'boom', QueueErrorCode.ServerError);
    const r2 = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP3', callbackId: 'cb-after-error' }));
    expect(r2.kind).toBe('duplicate');
  });

  test('a nacked audit row does not count as a prior duplicate', () => {
    queue.enqueueRejected({
      ...makeEnqueueInput({ msgControlId: 'DUP4', callbackId: 'cb-nack' }),
      lastError: 'rejected',
      errorCode: QueueErrorCode.DuplicateRejected,
    });
    // A nacked row reuses the control ID for audit only; a fresh intake of the
    // same ID must still insert rather than dedupe against the audit row.
    const r = queue.enqueue(makeEnqueueInput({ msgControlId: 'DUP4', callbackId: 'cb-real' }));
    expect(r.kind).toBe('inserted');
  });

  test('peekNextSeqNo is non-consuming; commitSeqNo advances per channel and persists across reopen', () => {
    // Peek does not advance: repeated peeks return the same value until committed.
    expect(queue.peekNextSeqNo('A')).toBe(0);
    expect(queue.peekNextSeqNo('A')).toBe(0);
    queue.commitSeqNo('A', 0);
    expect(queue.peekNextSeqNo('A')).toBe(1);
    queue.commitSeqNo('A', 1);
    expect(queue.peekNextSeqNo('A')).toBe(2);

    // Independent counter per channel.
    expect(queue.peekNextSeqNo('B')).toBe(0);
    queue.commitSeqNo('B', 0);
    expect(queue.peekNextSeqNo('B')).toBe(1);
    // A is unaffected by B.
    expect(queue.peekNextSeqNo('A')).toBe(2);

    // Survives a restart: reopen the same DB and the committed counter resumes.
    queue.commitSeqNo('A', 2);
    queue.close();
    queue = DurableQueue.open({ path: dbPath, log: createMockLogger() });
    expect(queue.peekNextSeqNo('A')).toBe(3);
    expect(queue.peekNextSeqNo('B')).toBe(1);
  });

  test('enqueue assignSeqNo assigns + commits the counter atomically with the insert, and not on a duplicate', () => {
    expect(queue.peekNextSeqNo('X')).toBe(0);

    // A fresh insert: the callback receives the peeked candidate, and enqueue
    // persists both the returned finalized bytes and the assigned seq number.
    const finalized = Buffer.from('finalized-with-seq-0');
    let stamped: number | undefined;
    const r1 = queue.enqueue(makeEnqueueInput({ channelName: 'X', msgControlId: 'DUP' }), {
      assignSeqNo: (candidate) => {
        stamped = candidate;
        return finalized;
      },
    });
    expect(r1.kind).toBe('inserted');
    expect(stamped).toBe(0);
    if (r1.kind === 'inserted') {
      expect(r1.row.seqNo).toBe(0);
      expect(r1.row.finalizedMessage.equals(finalized)).toBe(true);
    }
    // The counter advanced as part of the same insert.
    expect(queue.peekNextSeqNo('X')).toBe(1);

    // A duplicate short-circuits before assignment, so the callback never runs
    // and the counter is untouched.
    let called = false;
    const r2 = queue.enqueue(makeEnqueueInput({ channelName: 'X', msgControlId: 'DUP' }), {
      assignSeqNo: (candidate) => {
        called = true;
        return Buffer.from(`finalized-with-seq-${candidate}`);
      },
    });
    expect(r2.kind).toBe('duplicate');
    expect(called).toBe(false);
    expect(queue.peekNextSeqNo('X')).toBe(1);
  });

  test('a peeked-but-not-committed sequence number is not consumed', () => {
    // Simulates a failed enqueue: we peek (to stamp a candidate) but never commit.
    expect(queue.peekNextSeqNo('C')).toBe(0);
    // ...enqueue throws, so commitSeqNo is never called...
    // The next successful message peeks the same value — no number was burned.
    expect(queue.peekNextSeqNo('C')).toBe(0);
    queue.commitSeqNo('C', 0);
    expect(queue.peekNextSeqNo('C')).toBe(1);
  });

  test('claimNext returns FIFO order per channel and ignores other channels', () => {
    const a = queue.enqueue(makeEnqueueInput({ channelName: 'A', msgControlId: 'A1' }));
    queue.enqueue(makeEnqueueInput({ channelName: 'B', msgControlId: 'B1' }));
    const a2 = queue.enqueue(makeEnqueueInput({ channelName: 'A', msgControlId: 'A2' }));
    if (a.kind !== 'inserted' || a2.kind !== 'inserted') {
      throw new Error('expected inserted');
    }

    // The default single partition ('') serializes the whole channel: the head is
    // claimed first, and until it settles that partition is busy — so a second
    // claim returns null rather than handing out a concurrently-in-flight row.
    const first = queue.claimNext('A');
    expect(first?.id).toBe(a.row.id);
    expect(first?.state).toBe(MessageState.CLAIMED);
    expect(first?.attemptCount).toBe(1);
    expect(queue.claimNext('A')).toBeNull(); // partition busy — serialization guard

    // Once the head settles, the next-oldest row for the channel is claimable — FIFO.
    queue.markProcessed(a.row.id, AckOutcome.DELIVERED);
    const second = queue.claimNext('A');
    expect(second?.id).toBe(a2.row.id);

    // Drained: nothing left for A once A2 is claimed (B's row is untouched throughout).
    queue.markProcessed(a2.row.id, AckOutcome.DELIVERED);
    expect(queue.claimNext('A')).toBeNull();
  });

  test('claimNext returns null when no queued rows for the channel', () => {
    expect(queue.claimNext('nonexistent')).toBeNull();
  });

  test('requeue returns a claimed row to queued at the front of the FIFO', () => {
    const r1 = queue.enqueue(makeEnqueueInput({ channelName: 'A', msgControlId: 'RQ1' }));
    const r2 = queue.enqueue(makeEnqueueInput({ channelName: 'A', msgControlId: 'RQ2' }));
    if (r1.kind !== 'inserted' || r2.kind !== 'inserted') {
      throw new Error('expected inserted');
    }

    const claimed = queue.claimNext('A');
    expect(claimed?.id).toBe(r1.row.id);
    expect(claimed?.attemptCount).toBe(1);

    expect(queue.requeue(r1.row.id)).toBe(true);
    const requeued = queue.getById(r1.row.id);
    assertRowState(requeued, MessageState.QUEUED);
    expect(requeued.attemptCount).toBe(0);
    expect(rawColumn(r1.row.id, 'processing_started_at')).toBeNull();

    // Original id means original FIFO position: r1 is claimed again before r2.
    expect(queue.claimNext('A')?.id).toBe(r1.row.id);

    // requeue only applies to claimed rows.
    expect(queue.requeue(r2.row.id)).toBe(false);
    expect(queue.getById(r2.row.id)?.state).toBe(MessageState.QUEUED);
  });

  test('scheduleRetry returns a claimed/inflight row to queued with next_attempt_at and error metadata', () => {
    const r = queue.enqueue(makeEnqueueInput({ channelName: 'R', msgControlId: 'RTY1', callbackId: 'cb-rty' }));
    if (r.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    const claimed = queue.claimNext('R');
    expect(claimed?.attemptCount).toBe(1);
    // The request reached the wire before it failed — the common retry case.
    queue.markSent('cb-rty');
    expect(queue.getById(r.row.id)?.state).toBe(MessageState.INFLIGHT);

    const nextAttemptAt = Date.now() + 60_000;
    expect(queue.scheduleRetry(r.row.id, 'Server returned 503', QueueErrorCode.ServerError, nextAttemptAt)).toBe(true);

    const rescheduled = queue.getById(r.row.id);
    assertRowState(rescheduled, MessageState.QUEUED);
    expect(rescheduled.lastError).toBe('Server returned 503');
    expect(rescheduled.errorCode).toBe(QueueErrorCode.ServerError);
    expect(rescheduled.nextAttemptAt).toBe(nextAttemptAt);
    expect(rawColumn(r.row.id, 'processing_started_at')).toBeNull();
    // sent_at is cleared so the row reads as a clean re-queued entry.
    expect(rawColumn(r.row.id, 'sent_at')).toBeNull();
    // Unlike requeue, the attempt still counts — it reached the server.
    expect(rescheduled.attemptCount).toBe(1);

    // scheduleRetry only applies to claimed/inflight rows; a queued row is a no-op.
    expect(queue.scheduleRetry(r.row.id, 'again', QueueErrorCode.ServerError, nextAttemptAt)).toBe(false);
  });

  test('claimNext honors next_attempt_at and blocks the channel head-of-line', () => {
    const now = Date.now();
    const r1 = queue.enqueue(makeEnqueueInput({ channelName: 'R', msgControlId: 'HOL1' }));
    const r2 = queue.enqueue(makeEnqueueInput({ channelName: 'R', msgControlId: 'HOL2' }));
    if (r1.kind !== 'inserted' || r2.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    queue.claimNext('R', now);
    queue.scheduleRetry(r1.row.id, 'Server returned 503', QueueErrorCode.ServerError, now + 5000);

    // Head row is backing off: nothing claimable — including r2, which must NOT
    // skip ahead of r1 (per-channel FIFO ordering).
    expect(queue.claimNext('R', now)).toBeNull();
    expect(queue.claimNext('R', now + 4999)).toBeNull();

    // Once the backoff elapses, the retried row comes out first, with
    // next_attempt_at cleared and attempt_count bumped.
    const reclaimed = queue.claimNext('R', now + 5000);
    expect(reclaimed?.id).toBe(r1.row.id);
    expect(reclaimed?.attemptCount).toBe(2);
    expect(rawColumn(r1.row.id, 'next_attempt_at')).toBeNull();

    // And the channel resumes normal FIFO behind it.
    queue.markProcessed(r1.row.id, AckOutcome.DELIVERED);
    expect(queue.claimNext('R', now + 5000)?.id).toBe(r2.row.id);
  });

  describe('virtual channels (partitioned claim)', () => {
    test('distinct virtual channels are claimable concurrently; each is serialized within', () => {
      // Two partitions (X, Y) on one channel; X has two messages.
      const x1 = queue.enqueue(makeEnqueueInput({ channelName: 'VC', msgControlId: 'X1', virtualChannelKey: 'X' }));
      const y1 = queue.enqueue(makeEnqueueInput({ channelName: 'VC', msgControlId: 'Y1', virtualChannelKey: 'Y' }));
      const x2 = queue.enqueue(makeEnqueueInput({ channelName: 'VC', msgControlId: 'X2', virtualChannelKey: 'X' }));
      if (x1.kind !== 'inserted' || y1.kind !== 'inserted' || x2.kind !== 'inserted') {
        throw new Error('expected inserted');
      }

      // Claim twice with nothing settled: we get X's head and Y's head — two rows
      // in flight at once, because they're different partitions (concurrency).
      const first = queue.claimNext('VC');
      const second = queue.claimNext('VC');
      expect(first?.id).toBe(x1.row.id); // lowest-id head overall
      expect(second?.id).toBe(y1.row.id); // next partition, not busy
      expect(first?.virtualChannelKey).toBe('X');
      expect(second?.virtualChannelKey).toBe('Y');

      // Both partitions are now busy — X2 must wait behind X1 (per-partition FIFO),
      // and Y has nothing left. So a third claim yields nothing.
      expect(queue.claimNext('VC')).toBeNull();

      // Settle X1; X2 (same partition) becomes claimable, in order.
      queue.markProcessed(x1.row.id, AckOutcome.DELIVERED);
      expect(queue.claimNext('VC')?.id).toBe(x2.row.id);
    });

    test('a backing-off head blocks only its own virtual channel, not its siblings', () => {
      const now = Date.now();
      const x1 = queue.enqueue(makeEnqueueInput({ channelName: 'VC2', msgControlId: 'BX1', virtualChannelKey: 'X' }));
      const y1 = queue.enqueue(makeEnqueueInput({ channelName: 'VC2', msgControlId: 'BY1', virtualChannelKey: 'Y' }));
      if (x1.kind !== 'inserted' || y1.kind !== 'inserted') {
        throw new Error('expected inserted');
      }

      // X1 fails and is scheduled to retry in the future — X is now head-of-line blocked.
      queue.claimNext('VC2', now);
      queue.scheduleRetry(x1.row.id, 'Server returned 503', QueueErrorCode.ServerError, now + 5000);

      // Y is untouched by X's backoff: Y1 is still claimable right now.
      expect(queue.claimNext('VC2', now)?.id).toBe(y1.row.id);
      // Nothing else until X's backoff elapses (X blocked, Y now busy).
      expect(queue.claimNext('VC2', now)).toBeNull();
      // Once X's backoff passes, its head comes out.
      expect(queue.claimNext('VC2', now + 5000)?.id).toBe(x1.row.id);
    });

    test('recomputeVirtualChannelKeys repartitions only queued rows, leaving in-flight rows alone', () => {
      const r1 = queue.enqueue(makeEnqueueInput({ channelName: 'RC', msgControlId: 'RC1', virtualChannelKey: 'old' }));
      const r2 = queue.enqueue(makeEnqueueInput({ channelName: 'RC', msgControlId: 'RC2', virtualChannelKey: 'old' }));
      const otherChannel = queue.enqueue(
        makeEnqueueInput({ channelName: 'OTHER', msgControlId: 'O1', virtualChannelKey: 'old' })
      );
      if (r1.kind !== 'inserted' || r2.kind !== 'inserted' || otherChannel.kind !== 'inserted') {
        throw new Error('expected inserted');
      }

      // r1 is mid-dispatch (claimed) when the spec changes; it must keep its partition.
      queue.claimNext('RC');
      expect(queue.getById(r1.row.id)?.state).toBe(MessageState.CLAIMED);

      // Recompute assigns a new key derived from the row's bytes; here a constant 'new'.
      const changed = queue.recomputeVirtualChannelKeys('RC', () => 'new');

      expect(changed).toBe(1); // only r2 (queued) changed
      expect(queue.getById(r1.row.id)?.virtualChannelKey).toBe('old'); // claimed row untouched
      expect(queue.getById(r2.row.id)?.virtualChannelKey).toBe('new'); // queued row repartitioned
      expect(queue.getById(otherChannel.row.id)?.virtualChannelKey).toBe('old'); // other channel untouched
    });

    test('recomputeVirtualChannelKeys counts only rows whose key actually changed', () => {
      queue.enqueue(makeEnqueueInput({ channelName: 'RC3', msgControlId: 'S1', virtualChannelKey: 'keep' }));
      queue.enqueue(makeEnqueueInput({ channelName: 'RC3', msgControlId: 'S2', virtualChannelKey: 'keep' }));
      // Recomputing to the same key is a no-op — nothing changed.
      expect(queue.recomputeVirtualChannelKeys('RC3', () => 'keep')).toBe(0);
    });
  });

  test('markSent flips a claimed row to inflight and stamps sent_at', () => {
    const r = queue.enqueue(makeEnqueueInput({ msgControlId: 'SENT1', callbackId: 'cb-sent' }));
    if (r.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    // Not yet claimed → no-op (only `claimed` rows transition).
    expect(queue.markSent('cb-sent')).toBe(false);

    queue.claimNext(r.row.channelName);
    expect(queue.getById(r.row.id)?.state).toBe(MessageState.CLAIMED);
    expect(rawColumn(r.row.id, 'sent_at')).toBeNull();

    expect(queue.markSent('cb-sent', 1700000000000)).toBe(true);
    const sent = queue.getById(r.row.id);
    assertRowState(sent, MessageState.INFLIGHT);
    expect(sent.sentAt).toBe(1700000000000);

    // Idempotent: a second send (or a stray callback) doesn't re-transition.
    expect(queue.markSent('cb-sent')).toBe(false);
    // Unknown callback (e.g. a legacy non-durable send) is a no-op.
    expect(queue.markSent('cb-unknown')).toBe(false);
  });

  test('runInTransaction rolls back markSent when the send fails, leaving the row claimed', () => {
    // Mirrors App.sendToWebSocket: flip claimed→inflight and write the socket in
    // one transaction. If the socket write throws, the marker must roll back so
    // the row stays `claimed` (provably unsent, safe to requeue) instead of a
    // phantom `inflight` that no bytes ever backed.
    const r = queue.enqueue(makeEnqueueInput({ msgControlId: 'TXN1', callbackId: 'cb-txn' }));
    if (r.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    queue.claimNext(r.row.channelName);
    expect(queue.getById(r.row.id)?.state).toBe(MessageState.CLAIMED);

    const sendError = new Error('WebSocket send failed');
    expect(() =>
      queue.runInTransaction(() => {
        queue.markSent('cb-txn');
        throw sendError; // simulate the socket write throwing after the marker ran
      })
    ).toThrow(sendError);

    // The markSent inside the transaction was rolled back: still `claimed`, sent_at null.
    const after = queue.getById(r.row.id);
    expect(after?.state).toBe(MessageState.CLAIMED);
    expect(rawColumn(r.row.id, 'sent_at')).toBeNull();

    // And the committed path still transitions normally afterwards.
    queue.runInTransaction(() => {
      queue.markSent('cb-txn', 1700000000000);
    });
    const committed = queue.getById(r.row.id);
    assertRowState(committed, MessageState.INFLIGHT);
    expect(committed.sentAt).toBe(1700000000000);
  });

  test('markProcessed records the source-leg ack outcome and processed timestamp', () => {
    const r = queue.enqueue(makeEnqueueInput({ msgControlId: 'TS1' }));
    if (r.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    const claimed = queue.claimNext(r.row.channelName);
    expect(claimed?.processingStartedAt).not.toBeNull();

    queue.markProcessed(r.row.id, AckOutcome.DELIVERED, 1700000000000);
    const after = queue.getById(r.row.id);
    assertRowState(after, MessageState.PROCESSED);
    expect(after.processedAt).toBe(1700000000000);
    expect(after.ackOutcome).toBe(AckOutcome.DELIVERED);

    // The Bot can accept the message (processed) while the source ACK fails to
    // deliver — the two legs are recorded independently.
    const undelivered = queue.enqueue(makeEnqueueInput({ msgControlId: 'TS1b' }));
    if (undelivered.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    queue.claimNext(undelivered.row.channelName);
    queue.markProcessed(undelivered.row.id, AckOutcome.UNDELIVERED, 1700000000050);
    expect(queue.getById(undelivered.row.id)?.state).toBe(MessageState.PROCESSED);
    expect(queue.getById(undelivered.row.id)?.ackOutcome).toBe(AckOutcome.UNDELIVERED);
    expect(queue.getById(undelivered.row.id)?.errorCode).toBeNull();

    // A later retransmit-replay can close the source leg without touching state.
    queue.setAckOutcome(undelivered.row.id, AckOutcome.DELIVERED);
    expect(queue.getById(undelivered.row.id)?.state).toBe(MessageState.PROCESSED);
    expect(queue.getById(undelivered.row.id)?.ackOutcome).toBe(AckOutcome.DELIVERED);
  });

  test('markRejected and markFailed set the terminal Bot-leg state, error, and not_owed ack', () => {
    // markFailed: transient Bot-leg failure → `failed`, ack not owed.
    const f = queue.enqueue(makeEnqueueInput({ msgControlId: 'TS2' }));
    if (f.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    queue.claimNext(f.row.channelName);
    queue.markFailed(f.row.id, 'boom', QueueErrorCode.ServerError, 1700000000123);
    const failed = queue.getById(f.row.id);
    assertRowState(failed, MessageState.FAILED);
    expect(failed.lastError).toBe('boom');
    expect(failed.errorCode).toBe(QueueErrorCode.ServerError);
    expect(failed.erroredAt).toBe(1700000000123);
    expect(failed.ackOutcome).toBe(AckOutcome.NOT_OWED);

    // markRejected: permanent reject → `rejected`, ack not owed.
    const rj = queue.enqueue(makeEnqueueInput({ msgControlId: 'TS3' }));
    if (rj.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    queue.claimNext(rj.row.channelName);
    queue.markRejected(rj.row.id, 'bad message', QueueErrorCode.ServerRejected, 1700000000200);
    expect(queue.getById(rj.row.id)?.state).toBe(MessageState.REJECTED);
    expect(queue.getById(rj.row.id)?.errorCode).toBe(QueueErrorCode.ServerRejected);
    expect(queue.getById(rj.row.id)?.ackOutcome).toBe(AckOutcome.NOT_OWED);

    // The failed row is untouched by the rejected one.
    expect(queue.getById(f.row.id)?.state).toBe(MessageState.FAILED);
  });

  test('recordServerResponse writes statusCode + body without changing state', () => {
    const r = queue.enqueue(makeEnqueueInput({ msgControlId: 'RSP1' }));
    if (r.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    queue.claimNext(r.row.channelName);

    queue.recordServerResponse(r.row.id, 201, 'response-body');
    const reread = queue.getById(r.row.id);
    expect(reread?.serverStatusCode).toBe(201);
    expect(reread?.serverResponseBody?.toString()).toBe('response-body');
    expect(reread?.state).toBe(MessageState.CLAIMED);
  });

  test('findByCallback locates the row by callback_id', () => {
    const r = queue.enqueue(makeEnqueueInput({ msgControlId: 'CB1', callbackId: 'find-me' }));
    if (r.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    const found = queue.findByCallback('find-me');
    expect(found?.id).toBe(r.row.id);
    expect(queue.findByCallback('nope')).toBeNull();
  });

  test('recoverOnStartup fails inflight rows, requeues claimed rows, leaves queued alone', () => {
    // Different channels so each claim picks the row we expect.
    const qrow = queue.enqueue(makeEnqueueInput({ channelName: 'Q', msgControlId: 'Q1' }));
    const inflightRow = queue.enqueue(
      makeEnqueueInput({ channelName: 'I', msgControlId: 'I1', callbackId: 'cb-inflight' })
    );
    const claimedRow = queue.enqueue(makeEnqueueInput({ channelName: 'C', msgControlId: 'C1' }));
    if (qrow.kind !== 'inserted' || inflightRow.kind !== 'inserted' || claimedRow.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    // I1 reached the wire (claimed → inflight); C1 was only claimed (never sent).
    queue.claimNext('I');
    queue.markSent('cb-inflight');
    queue.claimNext('C');

    const recovered = queue.recoverOnStartup(1700000000000);
    expect(recovered).toEqual({ requeued: 1, failed: 1 });

    // Inflight is ambiguous → failed for operator review.
    expect(queue.getById(inflightRow.row.id)?.state).toBe(MessageState.FAILED);
    expect(queue.getById(inflightRow.row.id)?.lastError).toContain('interrupted');
    expect(queue.getById(inflightRow.row.id)?.errorCode).toBe(QueueErrorCode.Interrupted);
    // The source leg is genuinely unknown for an interrupted row — left pending.
    expect(queue.getById(inflightRow.row.id)?.ackOutcome).toBe(AckOutcome.PENDING);

    // Claimed-but-unsent provably never left → requeued (attempt decremented, ready to re-dispatch).
    expect(queue.getById(claimedRow.row.id)?.state).toBe(MessageState.QUEUED);
    expect(queue.getById(claimedRow.row.id)?.attemptCount).toBe(0);
    expect(rawColumn(claimedRow.row.id, 'processing_started_at')).toBeNull();

    // The untouched queued row stays queued.
    expect(queue.getById(qrow.row.id)?.state).toBe(MessageState.QUEUED);

    // Re-running is a no-op now that nothing is claimed/inflight.
    expect(queue.recoverOnStartup()).toEqual({ requeued: 0, failed: 0 });
  });

  test('recoverOnStartup requeues a guaranteed-delivery inflight row instead of failing it', () => {
    // A guaranteed-delivery channel accepted the duplication risk: an interrupted
    // inflight row goes back to `queued` (keep trying) rather than parking in
    // `failed` for review the way a normal channel's would. A merely-`claimed`
    // (provably-unsent) row requeues regardless of the setting, so both rows are
    // driven to `inflight` here to exercise the guaranteed/normal split.
    const guaranteed = queue.enqueue(
      makeEnqueueInput({ channelName: 'G', msgControlId: 'GD1', callbackId: 'cb-g', guaranteedDelivery: true })
    );
    const normal = queue.enqueue(makeEnqueueInput({ channelName: 'N', msgControlId: 'NORM1', callbackId: 'cb-n' }));
    if (guaranteed.kind !== 'inserted' || normal.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    expect(guaranteed.row.guaranteedDelivery).toBe(true);
    expect(normal.row.guaranteedDelivery).toBe(false);
    queue.claimNext('G');
    queue.markSent('cb-g');
    queue.claimNext('N');
    queue.markSent('cb-n');

    expect(queue.recoverOnStartup()).toEqual({ failed: 1, requeued: 1 });

    const recovered = queue.getById(guaranteed.row.id);
    assertRowState(recovered, MessageState.QUEUED);
    expect(recovered.errorCode).toBe(QueueErrorCode.Interrupted);
    expect(rawColumn(guaranteed.row.id, 'sent_at')).toBeNull();
    expect(recovered.nextAttemptAt).toBeNull();
    // Immediately claimable again — the guarantee survives the restart.
    expect(queue.claimNext('G')?.id).toBe(guaranteed.row.id);

    // The non-guaranteed inflight row is ambiguous (interrupted) → review-only `failed`.
    expect(queue.getById(normal.row.id)?.state).toBe(MessageState.FAILED);
  });

  test('enqueueRejected creates a nacked audit row with last_error, error_code, and ack_outcome=not_owed', () => {
    const row = queue.enqueueRejected({
      ...makeEnqueueInput({ msgControlId: 'NACK1' }),
      lastError: 'duplicate control id',
      errorCode: QueueErrorCode.DuplicateRejected,
    });
    expect(row?.state).toBe(MessageState.NACKED);
    expect(row?.lastError).toBe('duplicate control id');
    // The machine-readable code is persisted alongside last_error so tooling can
    // distinguish nacked reasons (storage error vs. duplicate) without parsing strings.
    expect(row?.errorCode).toBe(QueueErrorCode.DuplicateRejected);
    // An intake reject was answered synchronously with a NACK; no app-level ACK
    // is ever owed for it.
    expect(row?.ackOutcome).toBe(AckOutcome.NOT_OWED);
  });

  test('enqueueRejected persists distinct error codes for distinct reasons', () => {
    const storage = queue.enqueueRejected({
      ...makeEnqueueInput({ msgControlId: 'NACK-STORAGE' }),
      lastError: 'storage error: disk full',
      errorCode: QueueErrorCode.StorageError,
    });
    const dup = queue.enqueueRejected({
      ...makeEnqueueInput({ msgControlId: 'NACK-DUP' }),
      lastError: 'duplicate control id',
      errorCode: QueueErrorCode.DuplicateRejected,
    });
    expect(storage?.errorCode).toBe(QueueErrorCode.StorageError);
    expect(dup?.errorCode).toBe(QueueErrorCode.DuplicateRejected);
  });

  test('countByState reports correct totals across states', () => {
    const a = queue.enqueue(makeEnqueueInput({ msgControlId: 'CB-A' }));
    const b = queue.enqueue(makeEnqueueInput({ msgControlId: 'CB-B' }));
    if (a.kind !== 'inserted' || b.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
    queue.claimNext(a.row.channelName); // a → claimed
    queue.markProcessed(a.row.id, AckOutcome.DELIVERED);
    queue.claimNext(b.row.channelName); // b → claimed
    queue.markFailed(b.row.id, 'x', QueueErrorCode.DispatchFailed);
    queue.enqueueRejected({
      ...makeEnqueueInput({ msgControlId: 'CB-N' }),
      lastError: 'dup',
      errorCode: QueueErrorCode.DuplicateRejected,
    });

    expect(queue.countByState()).toEqual({
      queued: 0,
      claimed: 0,
      inflight: 0,
      processed: 1,
      rejected: 0,
      failed: 1,
      nacked: 1,
    });
  });

  test('getChannelDepth reports queued/claimed/inflight/oldest age', () => {
    const t0 = Date.now();
    queue.enqueue(
      makeEnqueueInput({ channelName: 'D', msgControlId: 'D1', receivedAt: t0 - 5000, callbackId: 'cb-d1' })
    );
    queue.enqueue(makeEnqueueInput({ channelName: 'D', msgControlId: 'D2', receivedAt: t0 - 1000 }));

    const depth = queue.getChannelDepth('D', t0);
    expect(depth.queued).toBe(2);
    expect(depth.claimed).toBe(0);
    expect(depth.inflight).toBe(0);
    expect(depth.oldestQueuedAgeMs).toBe(5000);

    // Claim D1 → claimed (worker owns it, not yet on the wire).
    queue.claimNext('D');
    const depth2 = queue.getChannelDepth('D', t0);
    expect(depth2.queued).toBe(1);
    expect(depth2.claimed).toBe(1);
    expect(depth2.inflight).toBe(0);

    // Send D1 → inflight (on the wire, awaiting response).
    queue.markSent('cb-d1');
    const depth3 = queue.getChannelDepth('D', t0);
    expect(depth3.queued).toBe(1);
    expect(depth3.claimed).toBe(0);
    expect(depth3.inflight).toBe(1);
  });

  test('listQueuedIdsForChannel returns FIFO ordered IDs', () => {
    const r1 = queue.enqueue(makeEnqueueInput({ channelName: 'L', msgControlId: 'L1' }));
    const r2 = queue.enqueue(makeEnqueueInput({ channelName: 'L', msgControlId: 'L2' }));
    queue.enqueue(makeEnqueueInput({ channelName: 'OTHER', msgControlId: 'X' }));
    if (r1.kind !== 'inserted' || r2.kind !== 'inserted') {
      throw new Error('expected inserted');
    }
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

  test('runs pending migrations on startup against a DB where only v1 is applied', () => {
    const v1OnlyPath = join(dir, 'v1-only.sqlite');

    // Build a DB that looks like one created by an older agent that only knew
    // about v1: apply just the v1 migration and stamp _schema at version 1.
    const seed = new DatabaseSync(v1OnlyPath);
    const v1 = MIGRATIONS.find((m) => m.version === 1);
    if (!v1) {
      throw new Error('v1 migration missing');
    }
    seed.exec('BEGIN');
    seed.exec(v1.sql);
    seed.prepare('INSERT INTO _schema (version, applied_at) VALUES (?, ?)').run(1, Date.now());
    seed.exec('COMMIT');
    const colsBefore = (seed.prepare("PRAGMA table_info('inbound_hl7_messages')").all() as { name: string }[]).map(
      (c) => c.name
    );
    expect(colsBefore).not.toContain('next_attempt_at');
    expect(colsBefore).not.toContain('guaranteed_delivery');
    expect(colsBefore).not.toContain('virtual_channel_key');
    seed.close();

    // Opening the queue is the real startup path; it must apply every pending migration.
    const q = DurableQueue.open({ path: v1OnlyPath, log: createMockLogger() });
    try {
      const db = q.getDb();
      const versions = (db.prepare('SELECT version FROM _schema ORDER BY version').all() as { version: number }[]).map(
        (r) => r.version
      );
      expect(versions).toEqual(MIGRATIONS.map((m) => m.version));
      const colsAfter = (db.prepare("PRAGMA table_info('inbound_hl7_messages')").all() as { name: string }[]).map(
        (c) => c.name
      );
      expect(colsAfter).toContain('next_attempt_at'); // v2
      expect(colsAfter).toContain('guaranteed_delivery'); // v2
      expect(colsAfter).toContain('virtual_channel_key'); // v3
    } finally {
      q.close();
    }
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

  test('checkpointWalIfDirty truncates the WAL after writes and no-ops when clean', () => {
    for (let i = 0; i < 20; i++) {
      queue.enqueue(makeEnqueueInput());
    }
    const walPath = `${dbPath}-wal`;
    expect(statSync(walPath).size).toBeGreaterThan(0);

    expect(queue.checkpointWalIfDirty()).toBe(true);
    expect(statSync(walPath).size).toBe(0);

    // Nothing written since the last checkpoint — skipped.
    expect(queue.checkpointWalIfDirty()).toBe(false);

    // A new write re-dirties the flag.
    queue.enqueue(makeEnqueueInput());
    expect(queue.checkpointWalIfDirty()).toBe(true);
    expect(statSync(walPath).size).toBe(0);
  });

  test('open() starts a recurring WAL-checkpoint loop and close() stops it', () => {
    // The loop is deliberately NOT gated on the dispatch lease: this queue never
    // acquires a lease (it stays a "follower"), yet its WAL still drains on the
    // interval — which is the whole reason the loop can't ride on the lease timers.
    vi.useFakeTimers();
    const loopDir = mkdtempSync(join(tmpdir(), 'dq-ckpt-loop-'));
    const loopPath = join(loopDir, 'queue.sqlite');
    const walPath = `${loopPath}-wal`;
    const loopQueue = DurableQueue.open({ path: loopPath, log: createMockLogger(), checkpointIntervalMs: 50 });
    try {
      // open()'s startup writes were already flushed; a fresh row re-dirties the WAL.
      loopQueue.enqueue(makeEnqueueInput());
      expect(statSync(walPath).size).toBeGreaterThan(0);

      // The interval fires → the dirty WAL is folded back into the main DB file.
      vi.advanceTimersByTime(50);
      expect(statSync(walPath).size).toBe(0);

      // It recurs — a later write drains on the next tick, not just the first one.
      loopQueue.enqueue(makeEnqueueInput());
      expect(statSync(walPath).size).toBeGreaterThan(0);
      vi.advanceTimersByTime(50);
      expect(statSync(walPath).size).toBe(0);

      // close() must stop the loop: no further checkpoint tick fires afterward.
      // (close() flushes via checkpointWal() directly, not checkpointWalIfDirty.)
      const ckptSpy = vi.spyOn(loopQueue, 'checkpointWalIfDirty');
      loopQueue.close();
      vi.advanceTimersByTime(500);
      expect(ckptSpy).not.toHaveBeenCalled();
    } finally {
      loopQueue.close();
      vi.useRealTimers();
      rmSync(loopDir, { recursive: true, force: true });
    }
  });

  test('checkpointWal reuses a prepared statement instead of re-compiling on every call', () => {
    // Regression: checkpointWal() ran on every heartbeat tick + retention sweep,
    // and used to call db.prepare() each time — leaking GC-finalised statement
    // objects proportional to heartbeat frequency. The statement is now prepared
    // once in the constructor, so checkpointWal() must never call prepare().
    const db = queue.getDb();
    const prepareSpy = vi.spyOn(db, 'prepare');
    try {
      for (let i = 0; i < 5; i++) {
        queue.enqueue(makeEnqueueInput());
        expect(queue.checkpointWal()).toBe(true);
      }
      expect(prepareSpy).not.toHaveBeenCalled();
    } finally {
      prepareSpy.mockRestore();
    }
  });

  test('close() checkpoints the WAL even when another connection holds the DB open', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    for (let i = 0; i < 50; i++) {
      queue.enqueue(makeEnqueueInput());
    }
    const walPath = `${dbPath}-wal`;
    expect(statSync(walPath).size).toBeGreaterThan(0);

    // A peer connection (upgrade overlap, operator's sqlite3 shell) suppresses
    // SQLite's implicit last-connection checkpoint — close() must flush explicitly.
    // The peer must touch the DB to attach to the WAL; an idle handle doesn't count.
    const peer = new DatabaseSync(dbPath);
    peer.exec('SELECT 1');
    try {
      queue.close();
      expect(statSync(walPath).size).toBe(0);
      const row = peer.prepare('SELECT COUNT(*) AS n FROM inbound_hl7_messages').get() as { n: number };
      expect(row.n).toBe(50);
    } finally {
      peer.close();
    }
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
