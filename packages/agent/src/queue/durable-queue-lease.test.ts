// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLogger, waitFor } from '../test-utils';
import type { DurableQueueOptions } from './durable-queue';
import { DurableQueue } from './durable-queue';

/**
 * Exercises the dispatch-lease loop that lives inside {@link DurableQueue}
 * (acquire/heartbeat/release + leader election). Two competing "processes" are
 * modeled as two DurableQueue instances opened on the same DB file, which is how
 * the upgrade overlap actually looks in production.
 */
describe('DurableQueue dispatch lease', () => {
  let dir: string;
  let path: string;
  const opened: DurableQueue[] = [];

  function openQueue(overrides?: Partial<DurableQueueOptions>): DurableQueue {
    const queue = DurableQueue.open({ path, log: createMockLogger(), ...overrides });
    opened.push(queue);
    return queue;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lease-test-'));
    path = join(dir, 'queue.sqlite');
  });

  afterEach(() => {
    for (const queue of opened.splice(0)) {
      queue.close();
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test('acquires the lease on start and fires onBecameLeader', async () => {
    const queue = openQueue({ leaseTtlMs: 5_000, leaseHeartbeatMs: 60_000, leaseAcquireRetryMs: 50 });
    const onLeader = vi.fn();
    queue.startDispatchLease(onLeader);

    await waitFor(() => queue.isLeader());
    expect(onLeader).toHaveBeenCalledTimes(1);
    expect(queue.getCurrentLease()?.holder).toBe(queue.getLeaseHolderId());

    queue.stopDispatchLease();
  });

  test('startDispatchLease is idempotent — a second call does not restart the loop', async () => {
    const queue = openQueue({ leaseTtlMs: 5_000, leaseHeartbeatMs: 60_000, leaseAcquireRetryMs: 50 });
    const onLeader = vi.fn();
    queue.startDispatchLease(onLeader);
    await waitFor(() => queue.isLeader());
    // Calling again with a different callback while the loop is active is a no-op.
    queue.startDispatchLease(vi.fn());
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(onLeader).toHaveBeenCalledTimes(1);

    queue.stopDispatchLease();
  });

  test('a second process waits for the first to release before becoming leader', async () => {
    const queueA = openQueue({ leaseTtlMs: 5_000, leaseHeartbeatMs: 60_000, leaseAcquireRetryMs: 25 });
    const queueB = openQueue({ leaseTtlMs: 5_000, leaseHeartbeatMs: 60_000, leaseAcquireRetryMs: 25 });

    const cbA = vi.fn();
    const cbB = vi.fn();

    queueA.startDispatchLease(cbA);
    await waitFor(() => queueA.isLeader());
    expect(cbA).toHaveBeenCalledTimes(1);

    queueB.startDispatchLease(cbB);
    // queueB should be unable to take over.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(queueB.isLeader()).toBe(false);
    expect(cbB).not.toHaveBeenCalled();

    // queueA releases — queueB should pick it up on the next retry.
    queueA.stopDispatchLease();
    await waitFor(() => queueB.isLeader(), 2000);
    expect(cbB).toHaveBeenCalledTimes(1);
    expect(queueB.getCurrentLease()?.holder).toBe(queueB.getLeaseHolderId());

    queueB.stopDispatchLease();
  });

  test('lease is taken over after the prior holder expires (no graceful release)', async () => {
    // queueA acquires with a tiny TTL but never heartbeats (heartbeat far in the
    // future), so its lease lapses without being extended and queueB takes over.
    const queueA = openQueue({ leaseTtlMs: 50, leaseHeartbeatMs: 60_000, leaseAcquireRetryMs: 25 });
    const queueB = openQueue({ leaseTtlMs: 5_000, leaseHeartbeatMs: 60_000, leaseAcquireRetryMs: 25 });

    queueA.startDispatchLease(vi.fn());
    await waitFor(() => queueA.isLeader());

    queueB.startDispatchLease(vi.fn());
    // Wait until queueB takes over (queueA's TTL expires).
    await waitFor(() => queueB.isLeader(), 2000);
    expect(queueB.getCurrentLease()?.holder).toBe(queueB.getLeaseHolderId());

    queueA.stopDispatchLease();
    queueB.stopDispatchLease();
  });

  test('heartbeat extends the lease beyond its initial TTL', async () => {
    const queue = openQueue({ leaseTtlMs: 200, leaseHeartbeatMs: 50, leaseAcquireRetryMs: 25 });
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

  test('stopDispatchLease releases the lease so a peer can acquire immediately', async () => {
    // Long TTLs to prove that stopDispatchLease() is what releases (not expiry).
    const queueA = openQueue({ leaseTtlMs: 60_000, leaseHeartbeatMs: 60_000, leaseAcquireRetryMs: 25 });
    const queueB = openQueue({ leaseTtlMs: 60_000, leaseHeartbeatMs: 60_000, leaseAcquireRetryMs: 25 });
    queueA.startDispatchLease(vi.fn());
    await waitFor(() => queueA.isLeader());

    queueB.startDispatchLease(vi.fn());
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 75);
    });
    expect(queueB.isLeader()).toBe(false);

    expect(queueA.stopDispatchLease()).toBe(true); // we were the leader
    await waitFor(() => queueB.isLeader(), 1000);
    expect(queueB.getCurrentLease()?.holder).toBe(queueB.getLeaseHolderId());

    queueB.stopDispatchLease();
  });

  test('stopDispatchLease on a non-leader returns false and is idempotent', () => {
    const queue = openQueue();
    expect(queue.stopDispatchLease()).toBe(false);
    expect(queue.stopDispatchLease()).toBe(false);
  });

  test('losing the lease mid-run drops back to follower', async () => {
    const queue = openQueue({ leaseTtlMs: 100, leaseHeartbeatMs: 30, leaseAcquireRetryMs: 50 });
    queue.startDispatchLease(vi.fn());
    await waitFor(() => queue.isLeader());

    // Force a peer to steal: release our row, then acquire as a foreign holder.
    queue.releaseLease(queue.getLeaseHolderId() as string);
    expect(queue.tryAcquireLease('peer', 60_000)).toBe(true);

    // Next heartbeat should observe the loss and flip us back to follower.
    await waitFor(() => !queue.isLeader(), 500);
    expect(queue.getCurrentLease()?.holder).toBe('peer');

    queue.stopDispatchLease();
  });

  test('reacquires the lease after a peer that stole it lapses', async () => {
    // There is no lost-leadership callback: loss is enforced at the data layer
    // (the dispatch ops throw QueueLeaseError once a peer holds the lease). After
    // losing it, the loop drops to follower and reclaims when the peer lapses.
    const queue = openQueue({ leaseTtlMs: 100, leaseHeartbeatMs: 30, leaseAcquireRetryMs: 25 });
    queue.startDispatchLease(vi.fn());
    await waitFor(() => queue.isLeader());

    // A peer steals the lease; the next heartbeat drops us back to follower.
    queue.releaseLease(queue.getLeaseHolderId() as string);
    expect(queue.tryAcquireLease('peer', 50)).toBe(true);
    await waitFor(() => !queue.isLeader(), 500);

    // Let the peer's short lease lapse; the loop reacquires on a later retry.
    queue.releaseLease('peer');
    await waitFor(() => queue.isLeader(), 1000);
    expect(queue.getCurrentLease()?.holder).toBe(queue.getLeaseHolderId());

    queue.stopDispatchLease();
  });
});
