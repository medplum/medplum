// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMockLogger } from '../test-utils';
import { DurableQueue } from './durable-queue';
import { QueueLeaseManager } from './lease-manager';

/**
 * Polls until `predicate` returns true or the timeout elapses. Centralised so the
 * intent (wait for a state transition) is obvious at every callsite.
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
      setTimeout(resolve, 5);
    });
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

describe('QueueLeaseManager', () => {
  let dir: string;
  let queue: DurableQueue;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lm-test-'));
    queue = DurableQueue.open({ path: join(dir, 'queue.sqlite'), log: createMockLogger() });
  });

  afterEach(() => {
    queue.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('acquires the lease on start and fires onBecameLeader', async () => {
    const mgr = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 5_000,
      heartbeatMs: 60_000,
      acquireRetryMs: 50,
    });
    const onLeader = vi.fn();
    mgr.start(onLeader);

    await waitFor(() => mgr.isLeader());
    expect(onLeader).toHaveBeenCalledTimes(1);
    expect(queue.getCurrentLease()?.holder).toBe(mgr.getHolderId());

    mgr.stop();
  });

  test('a second manager waits for the first to release before becoming leader', async () => {
    const mgr1 = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 5_000,
      heartbeatMs: 60_000,
      acquireRetryMs: 25,
    });
    const mgr2 = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 5_000,
      heartbeatMs: 60_000,
      acquireRetryMs: 25,
    });

    const cb1 = vi.fn();
    const cb2 = vi.fn();

    mgr1.start(cb1);
    await waitFor(() => mgr1.isLeader());
    expect(cb1).toHaveBeenCalledTimes(1);

    mgr2.start(cb2);
    // mgr2 should be unable to take over.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(mgr2.isLeader()).toBe(false);
    expect(cb2).not.toHaveBeenCalled();

    // mgr1 releases — mgr2 should pick it up on the next retry.
    mgr1.stop();
    await waitFor(() => mgr2.isLeader(), 2000);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(queue.getCurrentLease()?.holder).toBe(mgr2.getHolderId());

    mgr2.stop();
  });

  test('lease is taken over after the prior holder expires (no graceful release)', async () => {
    // mgr1 acquires but we never let it heartbeat, then we force-clear its
    // managed expiry by manually setting the lease very short.
    // We do this by constructing with ttlMs=50 and heartbeat far in the future,
    // so the lease lapses without being extended.
    const mgr1 = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 50,
      heartbeatMs: 60_000, // never heartbeats during this test
      acquireRetryMs: 25,
    });
    const mgr2 = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 5_000,
      heartbeatMs: 60_000,
      acquireRetryMs: 25,
    });
    mgr1.start(vi.fn());
    await waitFor(() => mgr1.isLeader());

    mgr2.start(vi.fn());
    // Wait until mgr2 takes over (mgr1's TTL expires).
    await waitFor(() => mgr2.isLeader(), 2000);
    expect(queue.getCurrentLease()?.holder).toBe(mgr2.getHolderId());

    // Don't stop() mgr1 — it would log a misleading "released" message after losing the lease.
    // Just clear its internal timers to avoid leaks.
    mgr1.stop();
    mgr2.stop();
  });

  test('heartbeat extends the lease beyond its initial TTL', async () => {
    const mgr = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 200,
      heartbeatMs: 50,
      acquireRetryMs: 25,
    });
    mgr.start(vi.fn());
    await waitFor(() => mgr.isLeader());
    const initialExpiry = queue.getCurrentLease()?.expiresAt as number;

    // Wait long enough for several heartbeats but less than 2x TTL.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 250);
    });
    expect(mgr.isLeader()).toBe(true);
    const laterExpiry = queue.getCurrentLease()?.expiresAt as number;
    expect(laterExpiry).toBeGreaterThan(initialExpiry);

    mgr.stop();
  });

  test('stop releases the lease so a peer can acquire immediately', async () => {
    const mgr1 = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 60_000, // long, to prove that stop() is what releases (not expiry)
      heartbeatMs: 60_000,
      acquireRetryMs: 25,
    });
    const mgr2 = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 60_000,
      heartbeatMs: 60_000,
      acquireRetryMs: 25,
    });
    mgr1.start(vi.fn());
    await waitFor(() => mgr1.isLeader());

    mgr2.start(vi.fn());
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 75);
    });
    expect(mgr2.isLeader()).toBe(false);

    expect(mgr1.stop()).toBe(true); // we were the leader
    await waitFor(() => mgr2.isLeader(), 1000);
    expect(queue.getCurrentLease()?.holder).toBe(mgr2.getHolderId());

    mgr2.stop();
  });

  test('stop on a non-leader manager returns false and is idempotent', () => {
    const mgr = new QueueLeaseManager({ queue, log: createMockLogger() });
    expect(mgr.stop()).toBe(false);
    expect(mgr.stop()).toBe(false);
  });

  test('losing the lease mid-run drops back to follower', async () => {
    const mgr = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 100,
      heartbeatMs: 30,
      acquireRetryMs: 50,
    });
    mgr.start(vi.fn());
    await waitFor(() => mgr.isLeader());

    // Force a peer to steal: set the lease to an expired one, then acquire as a peer.
    // We can simulate that by directly running the SQL — bypassing the heartbeat.
    queue.releaseLease(mgr.getHolderId());
    // A peer takes over.
    expect(queue.tryAcquireLease('peer', 60_000)).toBe(true);

    // Next heartbeat should observe the loss and flip us back to follower.
    await waitFor(() => !mgr.isLeader(), 500);
    expect(queue.getCurrentLease()?.holder).toBe('peer');

    mgr.stop();
  });

  test('losing the lease mid-run fires onLostLeadership so workers can drain', async () => {
    const onLost = vi.fn();
    const mgr = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 100,
      heartbeatMs: 30,
      acquireRetryMs: 50,
    });
    mgr.start(vi.fn(), onLost);
    await waitFor(() => mgr.isLeader());
    expect(onLost).not.toHaveBeenCalled();

    // A peer steals the lease, so the next heartbeat finds it gone.
    queue.releaseLease(mgr.getHolderId());
    expect(queue.tryAcquireLease('peer', 60_000)).toBe(true);

    await waitFor(() => onLost.mock.calls.length > 0, 500);
    expect(mgr.isLeader()).toBe(false);

    mgr.stop();
  });

  test('a throwing onLostLeadership does not stop the acquire-retry loop', async () => {
    const onLost = vi.fn(() => {
      throw new Error('drain blew up');
    });
    const mgr = new QueueLeaseManager({
      queue,
      log: createMockLogger(),
      ttlMs: 100,
      heartbeatMs: 30,
      acquireRetryMs: 25,
    });
    mgr.start(vi.fn(), onLost);
    await waitFor(() => mgr.isLeader());

    // Peer steals, then releases — mgr should still be able to reclaim despite
    // the drain callback throwing.
    queue.releaseLease(mgr.getHolderId());
    expect(queue.tryAcquireLease('peer', 50)).toBe(true);
    await waitFor(() => onLost.mock.calls.length > 0, 500);

    // Let the peer's short lease lapse; mgr should reacquire on a later retry.
    queue.releaseLease('peer');
    await waitFor(() => mgr.isLeader(), 1000);
    expect(queue.getCurrentLease()?.holder).toBe(mgr.getHolderId());

    mgr.stop();
  });
});
