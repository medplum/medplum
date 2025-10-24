// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Hl7Message, Logger } from '@medplum/core';
import { Hl7Client, Hl7Server } from '@medplum/hl7';
import { Hl7ClientPool } from './hl7-client-pool';

describe('Hl7ClientPool', () => {
  let server: Hl7Server;
  const port = 25123;

  beforeAll(() => {
    server = new Hl7Server((connection) => {
      connection.addEventListener('message', async ({ message }) => {
        await connection.send(message.buildAck());
      });
    });
    server.start(port);
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('keepAlive mode', () => {
    test('Reuses a single client when maxClientsPerRemote is 1', async () => {
      const log = new Logger(() => undefined);
      const createClientSpy = jest.fn((options) => new Hl7Client(options));

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClientsPerRemote: 1,
        log,
        createClient: createClientSpy,
      });

      // First request
      const client1 = await pool.getClient();
      expect(createClientSpy).toHaveBeenCalledTimes(1);

      // Release the client
      pool.releaseClient(client1);

      // Second request should reuse the same client
      const client2 = await pool.getClient();
      expect(createClientSpy).toHaveBeenCalledTimes(1);
      expect(client2).toBe(client1);

      pool.releaseClient(client2);
      await pool.closeAll();
    });

    test('Creates multiple clients up to maxClientsPerRemote', async () => {
      const log = new Logger(() => undefined);
      const createClientSpy = jest.fn((options) => new Hl7Client(options));

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClientsPerRemote: 3,
        log,
        createClient: createClientSpy,
      });

      // Get 3 clients without releasing
      const client1 = await pool.getClient();
      const client2 = await pool.getClient();
      const client3 = await pool.getClient();

      expect(createClientSpy).toHaveBeenCalledTimes(3);
      expect(pool.size()).toBe(3);

      // Release all clients
      pool.releaseClient(client1);
      pool.releaseClient(client2);
      pool.releaseClient(client3);

      await pool.closeAll();
    });

    test('Waits when maxClientsPerRemote is reached', async () => {
      const log = new Logger(() => undefined);
      const createClientSpy = jest.fn((options) => new Hl7Client(options));

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClientsPerRemote: 2,
        log,
        createClient: createClientSpy,
      });

      // Get 2 clients (max)
      const client1 = await pool.getClient();
      const client2 = await pool.getClient();
      expect(pool.size()).toBe(2);

      // Try to get a third client (should wait)
      let client3Resolved = false;
      const client3Promise = pool.getClient().then((client) => {
        client3Resolved = true;
        return client;
      });

      // Give it a moment to ensure it's waiting
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(client3Resolved).toBe(false);

      // Release one client
      pool.releaseClient(client1);

      // Now the third request should resolve
      const client3 = await client3Promise;
      expect(client3Resolved).toBe(true);
      expect(client3).toBe(client1); // Should get the released client

      pool.releaseClient(client2);
      pool.releaseClient(client3);
      await pool.closeAll();
    });

    test('Sends messages through pooled clients', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClientsPerRemote: 1,
        log,
        createClient: (options) => new Hl7Client(options),
      });

      const msg = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.5\rPID|1|99999999'
      );

      const client = await pool.getClient();
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
        maxClientsPerRemote: 3,
        log,
        createClient: (options) => new Hl7Client(options),
      });

      // Get multiple clients
      await pool.getClient();
      await pool.getClient();
      await pool.getClient();
      expect(pool.size()).toBe(3);

      // closeAll should remove all clients
      await pool.closeAll();
      expect(pool.size()).toBe(0);
    });
  });

  describe('non-keepAlive mode', () => {
    test('Creates new clients each time', async () => {
      const log = new Logger(() => undefined);
      const createClientSpy = jest.fn((options) => new Hl7Client(options));

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClientsPerRemote: 10,
        log,
        createClient: createClientSpy,
      });

      // First request
      const client1 = await pool.getClient();
      expect(createClientSpy).toHaveBeenCalledTimes(1);

      // Release and get another
      pool.releaseClient(client1);
      const client2 = await pool.getClient();

      // Should have created a second client
      expect(createClientSpy).toHaveBeenCalledTimes(2);
      expect(pool.size()).toBe(1); // Only one tracked (first was released)

      pool.releaseClient(client2);
      await pool.closeAll();
    });

    test('Enforces maxClientsPerRemote limit', async () => {
      const log = new Logger(() => undefined);
      const createClientSpy = jest.fn((options) => new Hl7Client(options));

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClientsPerRemote: 2,
        log,
        createClient: createClientSpy,
      });

      // Get 2 clients (max)
      const client1 = await pool.getClient();
      const client2 = await pool.getClient();
      expect(pool.size()).toBe(2);

      // Try to get a third client (should wait)
      let client3Resolved = false;
      const client3Promise = pool.getClient().then((client) => {
        client3Resolved = true;
        return client;
      });

      // Give it a moment to ensure it's waiting
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(client3Resolved).toBe(false);

      // Release one client
      pool.releaseClient(client1);

      // Now the third request should resolve
      const client3 = await client3Promise;
      expect(client3Resolved).toBe(true);

      pool.releaseClient(client2);
      pool.releaseClient(client3);
      await pool.closeAll();
    });

    test('Removes client from tracking on release', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: false,
        maxClientsPerRemote: 10,
        log,
        createClient: (options) => new Hl7Client(options),
      });

      const client = await pool.getClient();
      expect(pool.size()).toBe(1);

      pool.releaseClient(client);
      expect(pool.size()).toBe(0);

      await pool.closeAll();
    });
  });

  describe('closeAll', () => {
    test('Closes all clients in pool', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClientsPerRemote: 3,
        log,
        createClient: (options) => new Hl7Client(options),
      });

      // Create 3 clients
      await pool.getClient();
      await pool.getClient();
      await pool.getClient();

      expect(pool.size()).toBe(3);

      await pool.closeAll();

      expect(pool.size()).toBe(0);
    });

    test('Rejects waiting requests when pool is closed', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClientsPerRemote: 1,
        log,
        createClient: (options) => new Hl7Client(options),
      });

      // Get the only client
      await pool.getClient();

      // Try to get another (will wait)
      const client2Promise = pool.getClient();

      // Close the pool
      await pool.closeAll();

      // The waiting request should be rejected
      await expect(client2Promise).rejects.toThrow('Pool closed while waiting for available client');
    });
  });

  describe('concurrent requests', () => {
    test('Handles multiple concurrent requests in keepAlive mode', async () => {
      const log = new Logger(() => undefined);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClientsPerRemote: 3,
        log,
        createClient: (options) => new Hl7Client(options),
      });

      // Send 5 concurrent requests with max 3 clients
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const msg = Hl7Message.parse(
          `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.5\rPID|1|99999999`
        );

        promises.push(
          pool.getClient().then(async (client) => {
            try {
              const response = await client.sendAndWait(msg);
              return response;
            } finally {
              pool.releaseClient(client);
            }
          })
        );
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
        maxClientsPerRemote: 3,
        log,
        createClient: (options) => new Hl7Client(options),
      });

      // Send 5 concurrent requests with max 3 clients
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const msg = Hl7Message.parse(
          `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG${i.toString().padStart(5, '0')}|P|2.5\rPID|1|99999999`
        );

        promises.push(
          pool.getClient().then(async (client) => {
            try {
              const response = await client.sendAndWait(msg);
              return response;
            } finally {
              pool.releaseClient(client);
              await client.close();
            }
          })
        );
      }

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(5);

      // After all releases, should have 0 clients
      expect(pool.size()).toBe(0);

      await pool.closeAll();
    });
  });
});
