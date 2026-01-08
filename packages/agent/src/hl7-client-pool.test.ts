// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message, Logger, TypedEventTarget } from '@medplum/core';
// @ts-expect-error The __ functions are only exported for testing
// eslint-disable-next-line import/named
import { Hl7Server, __getCtorCallCount, __resetCtorCallCount } from '@medplum/hl7';
import { CLIENT_RELEASE_COUNTDOWN_MS } from './constants';
import type { EnhancedHl7Client } from './enhanced-hl7-client';
import { Hl7ClientPool } from './hl7-client-pool';
import type { HeartbeatEmitter } from './types';

jest.mock('@medplum/hl7', () => {
  const actual = jest.requireActual('@medplum/hl7');
  let ctorCallCount = 0;
  return {
    ...actual,
    Hl7Client: jest.fn().mockImplementation(function (...args) {
      ctorCallCount++;
      return new actual.Hl7Client(...args);
    }),
    __getCtorCallCount: (): number => {
      return ctorCallCount;
    },
    __resetCtorCallCount: (): void => {
      ctorCallCount = 0;
    },
  };
});

/**
 * Creates a fake EnhancedHl7Client for testing.
 *
 * @param opts - Optional overrides for the fake client.
 * @param opts.closeMock - Mock to invoke when closing the client.
 * @param opts.pendingMessages - Pending message count to simulate.
 * @param opts.connection - Whether the client connection is established.
 * @param opts.stats - Optional fake stats tracker for RTT aggregation tests.
 * @param opts.stats.getRttSamples - Function returning mock RTT samples.
 * @param opts.stats.getPendingCount - Function returning mock pending counts.
 * @returns A mocked EnhancedHl7Client instance.
 */
function createFakeClient({
  closeMock,
  pendingMessages,
  connection = true,
  stats,
}: {
  closeMock?: jest.Mock;
  pendingMessages?: number;
  connection?: boolean;
  stats?: { getRttSamples: () => number[]; getPendingCount: () => number };
} = {}): EnhancedHl7Client {
  const client = {
    close: closeMock ?? jest.fn().mockResolvedValue(undefined),
    connection: connection
      ? {
          getPendingMessageCount: jest.fn().mockReturnValue(pendingMessages ?? 0),
        }
      : undefined,
    startTrackingStats: jest.fn(() => {
      if (stats) {
        client.stats = stats as any;
      }
    }),
    stopTrackingStats: jest.fn(() => {
      client.stats = undefined;
    }),
    stats: stats as any,
  } as unknown as EnhancedHl7Client;

  return client;
}

describe('Hl7ClientPool', () => {
  let server: Hl7Server;
  const port = 57200;

  beforeAll(async () => {
    server = new Hl7Server((connection) => {
      connection.addEventListener('message', ({ message }) => {
        connection.send(message.buildAck());
      });
    });
    await server.start(port);
  });

  beforeEach(() => {
    __resetCtorCallCount();
  });

  afterAll(async () => {
    await server.stop();
    jest.unmock('@medplum/hl7');
  });

  describe('keepAlive mode', () => {
    test('Reuses a single client when maxClients is 1', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 1,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // First request
      const client1 = pool.getClient();
      expect(__getCtorCallCount()).toStrictEqual(1);

      // Release the client
      pool.releaseClient(client1);

      // Second request should reuse the same client
      const client2 = pool.getClient();
      expect(__getCtorCallCount()).toStrictEqual(1);
      expect(client2).toBe(client1);

      pool.releaseClient(client2);
      await pool.closeAll();
    });

    test('Creates multiple clients up to maxClients', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 3,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // Get 3 clients without releasing
      pool.getClient();
      pool.getClient();
      pool.getClient();

      expect(__getCtorCallCount()).toStrictEqual(3);
      expect(pool.size()).toStrictEqual(3);

      await pool.closeAll();
    });

    test('Re-uses clients when maxClients is reached', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 2,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // Get 2 clients (max)
      const client1 = pool.getClient();
      const client2 = pool.getClient();
      expect(pool.size()).toStrictEqual(2);

      // Release one client
      pool.releaseClient(client1);
      const client3 = pool.getClient();
      expect(client3).toStrictEqual(client1);

      pool.releaseClient(client2);
      await pool.closeAll();
    });

    test('Sends messages through pooled clients', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 1,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      const msg = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.5\rPID|1|99999999'
      );

      const client = pool.getClient();
      const response = await client.sendAndWait(msg);
      expect(response.header.getComponent(9, 1)).toBe('ACK');

      pool.releaseClient(client);
      await pool.closeAll();
    });

    test('closeAll removes all clients from pool', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 3,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // Get multiple clients
      pool.getClient();
      pool.getClient();
      pool.getClient();
      expect(pool.size()).toStrictEqual(3);

      // closeAll should remove all clients
      await pool.closeAll();
      expect(pool.size()).toStrictEqual(0);
    });

    test('releaseClient keeps client in pool when keepAlive and not forced', () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 2,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      const client = createFakeClient();
      pool.getClients().push(client);

      pool.releaseClient(client);
      expect(pool.size()).toBe(1);
    });

    test('releaseClient closes client when keepAlive and forced', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 2,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock });
      pool.getClients().push(client);

      pool.releaseClient(client, true);

      expect(pool.size()).toBe(0);
      expect(closeMock).toHaveBeenCalledTimes(1);
    });

    test('getClient does not return undefined when next client was removed', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 2,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      const client1 = pool.getClient();
      const client2 = pool.getClient();

      pool.releaseClient(client1);
      pool.releaseClient(client2);

      const reusedClient = pool.getClient();
      expect(reusedClient).toBe(client1);
      pool.releaseClient(reusedClient);

      pool.releaseClient(client2, true);

      // Should be a new client
      const nextClient = pool.getClient();
      expect(nextClient).not.toBeUndefined();

      expect(nextClient).not.toBe(client1);
      expect(nextClient).not.toBe(client2);

      await pool.closeAll();
    });
  });

  describe('Non-keepAlive mode', () => {
    test('Creates new clients up to maxClients', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 10,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // First request
      const client1 = pool.getClient();
      expect(__getCtorCallCount()).toStrictEqual(1);

      // Release and get another
      pool.releaseClient(client1);
      expect(pool.size()).toStrictEqual(0);
      const client2 = pool.getClient();

      // Should have created a second client
      expect(__getCtorCallCount()).toStrictEqual(2);
      expect(pool.size()).toStrictEqual(1); // Only one tracked (first was released)

      pool.releaseClient(client2);
      await pool.closeAll();
    });

    test('Enforces maxClients limit', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 2,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // Get 2 clients (max)
      const client1 = pool.getClient();
      const client2 = pool.getClient();
      expect(pool.size()).toBe(2);

      // Try to get a third client (should get one of the existing clients)
      const client3 = pool.getClient();
      expect([client1, client2]).toContain(client3);

      await pool.closeAll();
    });

    test('releaseClient closes client when not keepAlive and no connection yet (or connection already closed)', () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 10,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      const closeMock = jest.fn().mockResolvedValue(undefined);
      // Connection not present yet, still connecting or already closed
      const client = createFakeClient({ closeMock, connection: false });
      pool.getClients().push(client);
      expect(pool.size()).toBe(1);

      pool.releaseClient(client);
      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(pool.size()).toBe(0);
    });

    test('releaseClient keeps client when not keepAlive and pending messages', () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 10,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock, pendingMessages: 2 });
      pool.getClients().push(client);
      expect(pool.size()).toBe(1);

      pool.releaseClient(client);
      expect(closeMock).not.toHaveBeenCalled();
      expect(pool.size()).toBe(1);
    });

    test('releaseClient closes client when not keepAlive and forced', () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 10,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock, pendingMessages: 3 });
      pool.getClients().push(client);
      expect(pool.size()).toBe(1);

      pool.releaseClient(client, true);
      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(pool.size()).toBe(0);
    });
  });

  describe('Client GC', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    test('runClientGc removes clients idle past the countdown', () => {
      const log = new Logger(() => undefined);
      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 2,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      jest.useFakeTimers();
      jest.setSystemTime(0);

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock });
      pool.getClients().push(client);

      pool.releaseClient(client);

      // Client should still be in pool
      expect(pool.size()).toBe(1);
      expect(closeMock).not.toHaveBeenCalled();

      jest.setSystemTime(CLIENT_RELEASE_COUNTDOWN_MS + 1);
      pool.runClientGc();

      // Client should have been closed
      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(pool.size()).toBe(0);
    });

    test('runClientGc keeps clients that are still within the idle window', () => {
      const log = new Logger(() => undefined);
      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 2,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      jest.useFakeTimers();
      jest.setSystemTime(0);

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock });
      pool.getClients().push(client);
      pool.releaseClient(client);

      jest.setSystemTime(CLIENT_RELEASE_COUNTDOWN_MS - 1);
      pool.runClientGc();

      expect(closeMock).not.toHaveBeenCalled();
      expect(pool.size()).toBe(1);
    });

    test('runClientGc skips clients reused before GC executes', () => {
      const log = new Logger(() => undefined);
      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 1,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      jest.useFakeTimers();
      jest.setSystemTime(0);

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock });
      pool.getClients().push(client);
      pool.releaseClient(client);

      jest.setSystemTime(CLIENT_RELEASE_COUNTDOWN_MS + 1);

      const reusedClient = pool.getClient();
      expect(reusedClient).toBe(client);
      pool.releaseClient(reusedClient);

      pool.runClientGc();

      expect(closeMock).not.toHaveBeenCalled();
      expect(pool.size()).toBe(1);
    });

    test('runClientGc does not close clients with pending messages', async () => {
      const log = new Logger(() => undefined);
      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 1,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      jest.useFakeTimers();
      jest.setSystemTime(0);

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock, connection: true });
      const pendingSpy = client.connection?.getPendingMessageCount as jest.Mock;

      pendingSpy.mockReturnValue(2);
      pool.getClients().push(client);
      pool.releaseClient(client);

      jest.setSystemTime(CLIENT_RELEASE_COUNTDOWN_MS + 1);
      pool.runClientGc();

      expect(closeMock).not.toHaveBeenCalled();
      expect(pool.size()).toBe(1);

      // Now release client again after pending messages are processed
      pendingSpy.mockReturnValue(0);
      pool.releaseClient(client);

      jest.advanceTimersByTime(CLIENT_RELEASE_COUNTDOWN_MS + 1);
      pool.runClientGc();

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(pool.size()).toBe(0);

      await pool.closeAll();
    });

    test('runClientGc no-ops when keepAlive is enabled', () => {
      const log = new Logger(() => undefined);
      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 2,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      jest.useFakeTimers();
      jest.setSystemTime(0);

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock });
      pool.getClients().push(client);
      pool.releaseClient(client);

      jest.setSystemTime(CLIENT_RELEASE_COUNTDOWN_MS + 1);
      pool.runClientGc();

      expect(closeMock).not.toHaveBeenCalled();
      expect(pool.size()).toBe(1);
    });

    test('startAutoClientGc does not start when keepAlive is enabled', () => {
      const log = new Logger(() => undefined);
      const addEventListener = jest.fn();
      const removeEventListener = jest.fn();
      const heartbeatEmitter = {
        addEventListener,
        removeEventListener,
      } as unknown as HeartbeatEmitter;

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 2,
        log,
        heartbeatEmitter,
      });

      pool.startAutoClientGc();

      expect(addEventListener).not.toHaveBeenCalled();
      expect(removeEventListener).not.toHaveBeenCalled();
    });

    test('stopAutoClientGc stops automatic cleanup', () => {
      const log = new Logger(() => undefined);
      const heartbeatEmitter: HeartbeatEmitter = new TypedEventTarget();
      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 2,
        log,
        heartbeatEmitter,
      });

      jest.useFakeTimers();
      jest.setSystemTime(0);

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock });
      pool.getClients().push(client);
      pool.releaseClient(client);

      jest.setSystemTime(CLIENT_RELEASE_COUNTDOWN_MS + 1);
      heartbeatEmitter.dispatchEvent({ type: 'heartbeat' });

      expect(closeMock).toHaveBeenCalledTimes(1);
      expect(pool.size()).toBe(0);

      pool.stopAutoClientGc();

      const closeMock2 = jest.fn().mockResolvedValue(undefined);
      const client2 = createFakeClient({ closeMock: closeMock2 });
      pool.getClients().push(client2);

      jest.setSystemTime(CLIENT_RELEASE_COUNTDOWN_MS * 2);
      pool.releaseClient(client2);

      jest.setSystemTime(CLIENT_RELEASE_COUNTDOWN_MS * 2 + 1);
      heartbeatEmitter.dispatchEvent({ type: 'heartbeat' });

      expect(closeMock2).not.toHaveBeenCalled();
      expect(pool.size()).toBe(1);
    });

    test('GC starts automatically when keepAlive is disabled', () => {
      const log = new Logger(() => undefined);
      const addEventListener = jest.fn();
      const removeEventListener = jest.fn();
      const heartbeatEmitter = {
        addEventListener,
        removeEventListener,
      } as unknown as HeartbeatEmitter;

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 2,
        log,
        heartbeatEmitter,
      });

      expect(addEventListener).toHaveBeenCalledTimes(1);
      pool.stopAutoClientGc();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('closeAll', () => {
    test('Closes all clients in pool', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 3,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // Create 3 clients
      pool.getClient();
      pool.getClient();
      pool.getClient();

      expect(pool.size()).toBe(3);

      await pool.closeAll();

      expect(pool.size()).toBe(0);
    });

    test('Trying to get client after closeAll throws', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 1,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // Close the pool
      const closeAllPromise = pool.closeAll();

      // Trying to get a client while closing throws
      expect(() => pool.getClient()).toThrow('Cannot get new client, pool is closed');

      await closeAllPromise;

      // It will also throw after already closed
      expect(() => pool.getClient()).toThrow('Cannot get new client, pool is closed');
    });
  });

  describe('Concurrent requests', () => {
    test('Handles multiple concurrent requests in keepAlive mode', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 3,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // Send 5 concurrent requests with max 3 clients
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const msg = Hl7Message.parse(
          `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.5\rPID|1|99999999`
        );

        promises.push(async () => {
          const client = pool.getClient();
          try {
            const response = await client.sendAndWait(msg);
            return response;
          } finally {
            pool.releaseClient(client);
          }
        });
      }

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(5);

      // Should have created at most 3 clients
      expect(pool.size()).toBeLessThanOrEqual(3);

      await pool.closeAll();
    });

    test('Handles multiple concurrent requests in non-keepAlive mode', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 3,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      // Send 5 concurrent requests with max 3 clients
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const msg = Hl7Message.parse(
          `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.5\rPID|1|99999999`
        );

        promises.push(async () => {
          const client = pool.getClient();
          try {
            const response = await client.sendAndWait(msg);
            return response;
          } finally {
            pool.releaseClient(client);
            await client.close();
          }
        });
      }

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(5);

      // After all releases, should have 0 clients
      expect(pool.size()).toBe(0);

      await pool.closeAll();
    });
  });

  describe('Stats tracking', () => {
    test('Aggregates stats from tracked clients', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 3,
        log,
        heartbeatEmitter: new TypedEventTarget(),
      });

      const clientAStats = {
        getRttSamples: jest.fn().mockReturnValue([100, 120]),
        getPendingCount: jest.fn().mockReturnValue(1),
      };
      const clientBStats = {
        getRttSamples: jest.fn().mockReturnValue([200]),
        getPendingCount: jest.fn().mockReturnValue(2),
      };

      const clientA = createFakeClient({ stats: clientAStats });
      const clientB = createFakeClient({ stats: clientBStats });
      const clientWithoutStats = createFakeClient();

      pool.getClients().push(clientA, clientB, clientWithoutStats);

      pool.startTrackingStats();

      const poolStats = pool.getPoolStats();
      expect(poolStats).toBeDefined();
      expect(poolStats?.rtt).toStrictEqual({
        count: 3,
        min: 100,
        max: 200,
        average: 140,
        p50: 120,
        p95: 200,
        p99: 200,
        pendingCount: 3,
      });

      await pool.closeAll();
    });
  });
});
