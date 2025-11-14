// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message, Logger } from '@medplum/core';
// @ts-expect-error The __ functions are only exported for testing
// eslint-disable-next-line import/named
import { Hl7Server, __getCtorCallCount, __resetCtorCallCount } from '@medplum/hl7';
import type { EnhancedHl7Client } from './enhanced-hl7-client';
import { Hl7ClientPool } from './hl7-client-pool';

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

function createFakeClient({
  closeMock,
  pendingMessages,
}: { closeMock?: jest.Mock; pendingMessages?: number } = {}): EnhancedHl7Client {
  return {
    close: closeMock ?? jest.fn().mockResolvedValue(undefined),
    connection: {
      getPendingMessageCount: jest.fn().mockReturnValue(pendingMessages ?? 0),
    },
  } as unknown as EnhancedHl7Client;
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
      });

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock });
      pool.getClients().push(client);

      pool.releaseClient(client, true);

      expect(pool.size()).toBe(0);
      expect(closeMock).toHaveBeenCalledTimes(1);
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

    test('releaseClient closes client when not keepAlive and no pending messages', () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClients: 10,
        log,
      });

      const closeMock = jest.fn().mockResolvedValue(undefined);
      const client = createFakeClient({ closeMock, pendingMessages: 0 });
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

  describe('closeAll', () => {
    test('Closes all clients in pool', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 3,
        log,
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
});
