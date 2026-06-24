// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLogger, waitFor } from '../test-utils';
import { DurableQueue } from './durable-queue';

/**
 * Dispatch-lease orchestration (the acquire/heartbeat/reclaim loop, formerly the
 * standalone DispatchLeaseManager, now folded into {@link DurableQueue}). Each
 * "peer" is a separate DurableQueue connection opened on the SAME database file —
 * the faithful model of the cross-process upgrade-overlap scenario the lease
 * exists for. The raw lease SQL primitives are covered separately in
 * durable-queue.test.ts; here we exercise the timer-driven loop on top of them.
 */
describe('dispatch lease orchestration', () => {
  let dir: string;
  let dbPath: string;
  const opened: DurableQueue[] = [];

  function openQueue(opts?: { ttlMs?: number; heartbeatMs?: number; acquireRetryMs?: number }): DurableQueue {
    const queue = DurableQueue.open({
      path: dbPath,
      log: createMockLogger(),
      leaseTtlMs: opts?.ttlMs,
      leaseHeartbeatMs: opts?.heartbeatMs,
      leaseAcquireRetryMs: opts?.acquireRetryMs,
    });
    opened.push(queue);
    return queue;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lm-test-'));
    dbPath = join(dir, 'queue.sqlite');
  });

  afterEach(() => {
    for (const queue of opened) {
      try {
        queue.close();
      } catch {
        // ignore — some tests deliberately leave a queue having lost its lease.
      }
    }
    opened.length = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  test('acquires the lease on start and fires onBecameLeader', async () => {
    const queue = openQueue({ ttlMs: 5_000, heartbeatMs: 60_000, acquireRetryMs: 50 });
    const onLeader = vi.fn();
    queue.startDispatchLease(onLeader);

    await waitFor(() => queue.isLeader());
    expect(onLeader).toHaveBeenCalledTimes(1);
    expect(queue.getCurrentLease()?.holder).toBe(queue.getLeaseHolderId());

    queue.stopDispatchLease();
  });

  test('a second process waits for the first to release before becoming leader', async () => {
    const queue1 = openQueue({ ttlMs: 5_000, heartbeatMs: 60_000, acquireRetryMs: 25 });
    const queue2 = openQueue({ ttlMs: 5_000, heartbeatMs: 60_000, acquireRetryMs: 25 });

    const cb1 = vi.fn();
    const cb2 = vi.fn();

    queue1.startDispatchLease(cb1);
    await waitFor(() => queue1.isLeader());
    expect(cb1).toHaveBeenCalledTimes(1);

    queue2.startDispatchLease(cb2);
    // queue2 should be unable to take over.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(queue2.isLeader()).toBe(false);
    expect(cb2).not.toHaveBeenCalled();

    // queue1 releases — queue2 should pick it up on the next retry.
    queue1.stopDispatchLease();
    await waitFor(() => queue2.isLeader(), 2000);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(queue2.getCurrentLease()?.holder).toBe(queue2.getLeaseHolderId());

    queue2.stopDispatchLease();
  });

  test('lease is taken over after the prior holder expires (no graceful release)', async () => {
    // queue1 acquires with a very short TTL and a heartbeat far in the future, so
    // its lease lapses without ever being extended — simulating an ungraceful
    // death where no release happens.
    const queue1 = openQueue({ ttlMs: 50, heartbeatMs: 60_000, acquireRetryMs: 25 });
    const queue2 = openQueue({ ttlMs: 5_000, heartbeatMs: 60_000, acquireRetryMs: 25 });
    queue1.startDispatchLease(vi.fn());
    await waitFor(() => queue1.isLeader());

    queue2.startDispatchLease(vi.fn());
    // Wait until queue2 takes over (queue1's TTL expires).
    await waitFor(() => queue2.isLeader(), 2000);
    expect(queue2.getCurrentLease()?.holder).toBe(queue2.getLeaseHolderId());

    queue1.stopDispatchLease();
    queue2.stopDispatchLease();
  });

  test('heartbeat extends the lease beyond its initial TTL', async () => {
    const queue = openQueue({ ttlMs: 200, heartbeatMs: 50, acquireRetryMs: 25 });
    queue.startDispatchLease(vi.fn());
    await waitFor(() => queue.isLeader());
    const initialExpiry = queue.getCurrentLease()?.expiresAt as number;

    // Wait long enough for several heartbeats but less than 2x TTL.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
    expect(queue.isLeader()).toBe(true);
    const laterExpiry = queue.getCurrentLease()?.expiresAt as number;
    expect(laterExpiry).toBeGreaterThan(initialExpiry);

    queue.stopDispatchLease();
  });

  test('stop releases the lease so a peer can acquire immediately', async () => {
    // Long TTLs, to prove that stopDispatchLease() is what releases (not expiry).
    const queue1 = openQueue({ ttlMs: 60_000, heartbeatMs: 60_000, acquireRetryMs: 25 });
    const queue2 = openQueue({ ttlMs: 60_000, heartbeatMs: 60_000, acquireRetryMs: 25 });
    queue1.startDispatchLease(vi.fn());
    await waitFor(() => queue1.isLeader());

    queue2.startDispatchLease(vi.fn());
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 75);
    });
    expect(queue2.isLeader()).toBe(false);

    expect(queue1.stopDispatchLease()).toBe(true); // we were the leader
    await waitFor(() => queue2.isLeader(), 1000);
    expect(queue2.getCurrentLease()?.holder).toBe(queue2.getLeaseHolderId());

    queue2.stopDispatchLease();
  });

  test('stop on a non-leader returns false and is idempotent', () => {
    const queue = openQueue();
    expect(queue.stopDispatchLease()).toBe(false);
    expect(queue.stopDispatchLease()).toBe(false);
  });

  test('losing the lease mid-run drops back to follower', async () => {
    const queue = openQueue({ ttlMs: 100, heartbeatMs: 30, acquireRetryMs: 50 });
    queue.startDispatchLease(vi.fn());
    await waitFor(() => queue.isLeader());

    // Force a peer to steal: release our row, then acquire as a foreign holder —
    // bypassing the heartbeat, simulating a peer that took over after our TTL.
    queue.releaseLease(queue.getLeaseHolderId() as string);
    expect(queue.tryAcquireLease('peer', 60_000)).toBe(true);

    // Next heartbeat should observe the loss and flip us back to follower.
    await waitFor(() => !queue.isLeader(), 500);
    expect(queue.getCurrentLease()?.holder).toBe('peer');

    queue.stopDispatchLease();
  });

  test('reacquires the lease after a peer that stole it lapses', async () => {
    // There is no lost-leadership callback: loss is enforced at the data layer
    // (the dispatch ops throw QueueLeaseError once a peer holds the lease). The
    // loop's only job after losing the lease is to drop to follower and reclaim
    // it when the peer's lease lapses.
    const queue = openQueue({ ttlMs: 100, heartbeatMs: 30, acquireRetryMs: 25 });
    queue.startDispatchLease(vi.fn());
    await waitFor(() => queue.isLeader());

    // A peer steals the lease; the next heartbeat drops us back to follower.
    queue.releaseLease(queue.getLeaseHolderId() as string);
    expect(queue.tryAcquireLease('peer', 50)).toBe(true);
    await waitFor(() => !queue.isLeader(), 500);

    // Let the peer's short lease lapse; we reacquire on a later retry.
    queue.releaseLease('peer');
    await waitFor(() => queue.isLeader(), 1000);
    expect(queue.getCurrentLease()?.holder).toBe(queue.getLeaseHolderId());

    queue.stopDispatchLease();
  });
});
