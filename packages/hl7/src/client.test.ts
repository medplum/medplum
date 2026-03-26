// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AckCode } from '@medplum/core';
import { Hl7Message, isOperationOutcome, OperationOutcomeError, ReturnAckCategory, sleep } from '@medplum/core';
import type { Socket } from 'node:net';
import net, { createServer } from 'node:net';
import { Hl7Client } from './client';
import type { Hl7Connection } from './connection';
import type { Hl7ErrorEvent } from './events';
import { Hl7Server } from './server';
import { MockServer, MockSocket } from './test-utils';

describe('Hl7Client', () => {
  // Used only for tests that need a free port number with *nothing* listening on it.
  // For tests that start an Hl7Server, prefer `server.start(0)` which returns the OS-assigned
  // port and never has a release-then-rebind window.
  async function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.listen(0, () => {
        const { port } = server.address() as { port: number };
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve(port);
          }
        });
      });
      server.on('error', reject);
    });
  }

  describe('sendAndWait', () => {
    let port: number;
    const defaultResponseCb = (message: Hl7Message): Hl7Message => {
      return message.buildAck();
    };

    let hl7Server: Hl7Server;
    let hl7Client: Hl7Client;
    let nextResponseCb: ((message: Hl7Message) => Hl7Message) | undefined = undefined;

    beforeAll(async () => {
      hl7Server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          // Check if a response cb has been set, otherwise use the default
          if (nextResponseCb) {
            connection.send(nextResponseCb(message));
          } else {
            connection.send(defaultResponseCb(message));
          }
        });
      });
      port = await hl7Server.start(0);
    });

    beforeEach(async () => {
      nextResponseCb = undefined;

      hl7Client = new Hl7Client({
        host: 'localhost',
        port,
      });
      await hl7Client.connect();
    });

    afterEach(async () => {
      await hl7Client.close();
    });

    afterAll(async () => {
      await hl7Server.stop();
    });

    test('Resolves on when receiving ACK containing the message control ID', async () => {
      const ack = await hl7Client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
        )
      );
      expect(ack).toBeDefined();
    });

    test('Does not resolve on the incorrect message control ID', async () => {
      // Set up a custom response callback that sends an ACK with a different message control ID
      nextResponseCb = (message: Hl7Message) => {
        // Create an ACK with a different message control ID than the original message
        const ack = message.buildAck();
        // Change the message control ID in the ACK to something different
        ack.getSegment('MSA')?.setField(2, 'DIFFERENT_MSG_ID');
        return ack;
      };

      let timedOut = false;
      try {
        await hl7Client.sendAndWait(
          Hl7Message.parse(
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          ),
          { timeoutMs: 100 }
        );
      } catch (err) {
        if (
          isOperationOutcome((err as OperationOutcomeError).outcome) &&
          (err as OperationOutcomeError).outcome.issue?.[0].details?.text === 'Client timeout'
        ) {
          timedOut = true;
        } else {
          throw err;
        }
      }

      expect(timedOut).toStrictEqual(true);
    });

    test('Emits warning when receiving an ACK for a message control ID not found in pending messages', async () => {
      // Set up a custom response callback that sends an ACK with a different message control ID
      nextResponseCb = (message: Hl7Message) => {
        // Create an ACK with a different message control ID than the original message
        const ack = message.buildAck();
        // Change the message control ID in the ACK to something different
        ack.getSegment('MSA')?.setField(2, 'UNKNOWN_MSG_ID');
        return ack;
      };

      // Listen for warning events
      let warningEvent: any = null;
      hl7Client.addEventListener('warning', (event) => {
        if (
          event.error instanceof OperationOutcomeError &&
          isOperationOutcome(event.error.outcome) &&
          event.error.outcome.issue?.[0].severity === 'warning' &&
          event.error.outcome.issue?.[0].details?.text === 'Response received for unknown message control ID'
        ) {
          warningEvent = event;
        }
      });

      // Send a message and wait for the ACK with wrong message control ID
      await hl7Client
        .sendAndWait(
          Hl7Message.parse(
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          ),
          { timeoutMs: 100 }
        )
        .catch(() => {
          // Expected to timeout since ACK has wrong message control ID
        });

      // Wait until next tick for event to process
      await sleep(0);

      expect(warningEvent).toBeDefined();
      expect(warningEvent.error.outcome.issue[0].diagnostics).toContain('UNKNOWN_MSG_ID');
    });

    test('Rejects when message response times out', async () => {
      // Set up a custom response callback that doesn't respond (to trigger timeout)
      nextResponseCb = (_message: Hl7Message) => {
        // Don't send any response, which will cause the client to timeout
        return null as any;
      };

      let timeoutError: any = null;
      try {
        await hl7Client.sendAndWait(
          Hl7Message.parse(
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          ),
          { timeoutMs: 100 }
        );
      } catch (err) {
        timeoutError = err;
      }

      expect(timeoutError).toBeDefined();
      expect(timeoutError).toBeInstanceOf(OperationOutcomeError);
      expect(isOperationOutcome(timeoutError.outcome)).toBe(true);
      expect(timeoutError.outcome.issue?.[0].code).toBe('timeout');
      expect(timeoutError.outcome.issue?.[0].details?.text).toBe('Client timeout');
      expect(timeoutError.outcome.issue?.[0].diagnostics).toContain('Request timed out after waiting 100 milliseconds');
    });

    test('Rejects outstanding promises and emits error when close is called', async () => {
      // Set up a custom response callback that doesn't respond immediately
      nextResponseCb = (_message: Hl7Message) => {
        // Don't send any response, keeping the promise pending
        return null as any;
      };

      // Start a sendAndWait that will remain pending
      const pendingPromise = hl7Client.sendAndWait(
        Hl7Message.parse(
          'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
        ),
        { timeoutMs: 1000 } // Long timeout to ensure it stays pending
      );

      // Wait a bit to ensure the message is sent and pending
      await sleep(0);

      // Listen for error events
      let closeErrorEvent: Hl7ErrorEvent | undefined = undefined;
      hl7Client.addEventListener('error', (event) => {
        if (
          event.error instanceof OperationOutcomeError &&
          isOperationOutcome(event.error.outcome) &&
          event.error.outcome.issue?.[0].details?.text === 'Messages were still pending when connection closed'
        ) {
          closeErrorEvent = event;
        }
      });

      let errorFromClose: Error | undefined;
      // Close the client while message is pending
      const closePromise = hl7Client.close().catch((err) => {
        errorFromClose = err;
      });

      // Verify the pending promise was rejected
      let promiseRejected = false;
      let rejectionError: OperationOutcomeError | undefined = undefined;
      try {
        await pendingPromise;
      } catch (err) {
        promiseRejected = true;
        rejectionError = err as OperationOutcomeError;
      }

      expect(promiseRejected).toBe(true);
      expect(rejectionError).toBeInstanceOf(OperationOutcomeError);
      expect(isOperationOutcome(rejectionError?.outcome)).toBe(true);
      expect(rejectionError?.outcome.issue?.[0].code).toBe('incomplete');
      expect(rejectionError?.outcome.issue?.[0].details?.text).toBe('Message was still pending when connection closed');

      // Close itself should not emit any errors
      await closePromise;
      expect(errorFromClose).toBeUndefined();

      // Verify the error event was emitted
      expect(closeErrorEvent).toBeDefined();
      expect(
        ((closeErrorEvent as unknown as Hl7ErrorEvent)?.error as OperationOutcomeError)?.outcome?.issue?.[0].details
          ?.text
      ).toBe('Messages were still pending when connection closed');
      expect(
        ((closeErrorEvent as unknown as Hl7ErrorEvent)?.error as OperationOutcomeError)?.outcome?.issue?.[0].diagnostics
      ).toContain('Hl7Connection closed while 1 messages were pending');
    });

    test('Sending a message without a message control ID rejects', async () => {
      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );
      message.getSegment('MSH')?.setField(10, '');

      let threw = false;
      try {
        await hl7Client.sendAndWait(message);
      } catch (err) {
        threw = true;
        expect(err).toBeInstanceOf(OperationOutcomeError);
        expect(isOperationOutcome((err as OperationOutcomeError).outcome)).toBe(true);
        expect((err as OperationOutcomeError).outcome.issue?.[0].details?.text).toBe('Required field missing: MSH.10');
      }

      expect(threw).toStrictEqual(true);
    });

    test.each(['AA', 'AE', 'AR', 'CA', 'CE', 'CR'] as const satisfies AckCode[])(
      'Returns on %s when returnAck is specified as ReturnAckCategory.FIRST',
      async (ackCode) => {
        nextResponseCb = (message: Hl7Message) => {
          return message.buildAck({ ackCode });
        };

        const response = await hl7Client.sendAndWait(
          Hl7Message.parse(
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          ),
          { returnAck: ReturnAckCategory.FIRST }
        );

        expect(response).toBeDefined();
        // Should return on the first ACK
        expect(response.getSegment('MSA')?.getField(1)?.toString()).toStrictEqual(ackCode);
      }
    );

    test.each(['AA', 'AE', 'AR', 'CE', 'CR'] as const)(
      'Returns on %s when returnAck is specified as ReturnAckCategory.APPLICATION',
      async (ackCode) => {
        // Set up a custom response callback that sends the specific ACK code
        nextResponseCb = (message: Hl7Message) => {
          return message.buildAck({ ackCode });
        };

        const response = await hl7Client.sendAndWait(
          Hl7Message.parse(
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          ),
          { returnAck: ReturnAckCategory.APPLICATION }
        );

        expect(response).toBeDefined();
        expect(response.getSegment('MSA')?.getField(1)?.toString()).toStrictEqual(ackCode);
      }
    );

    test('Does not return on CA when returnAck is specified as ReturnAckCategory.APPLICATION', async () => {
      // Set up a custom response callback that sends a CA ACK
      nextResponseCb = (message: Hl7Message) => {
        return message.buildAck({ ackCode: 'CA' });
      };

      let timedOut = false;
      try {
        await hl7Client.sendAndWait(
          Hl7Message.parse(
            'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
              'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
          ),
          { returnAck: 'application', timeoutMs: 100 }
        );
      } catch (err) {
        if (
          isOperationOutcome((err as OperationOutcomeError).outcome) &&
          (err as OperationOutcomeError).outcome.issue?.[0].details?.text === 'Client timeout'
        ) {
          timedOut = true;
        } else {
          throw err;
        }
      }

      expect(timedOut).toStrictEqual(true);
    });
  });

  // Test the basic connection and timeout functionality
  test('Connection timeout when server is unreachable', async () => {
    // Use a port where no server is running
    const unreachablePort = await getFreePort();

    // Create client with a short timeout (500ms)
    const client = new Hl7Client({
      host: 'localhost',
      port: unreachablePort,
      connectTimeout: 500,
    });

    // Attempt to connect should fail with timeout error
    await expect(client.connect()).rejects.toThrow();

    // Cleanup
    await client.close();
  });

  // Test sending to a non-responsive server
  test('Connection timeout when server does not respond', async () => {
    const port = await getFreePort();

    // Create client with a short timeout
    const client = new Hl7Client({
      host: '10.255.255.1', // Use an unreachable IP address
      port,
      connectTimeout: 500,
    });

    // Attempt to connect should fail with timeout error
    await expect(client.connect()).rejects.toThrow('Connection timeout after 500ms');

    // Close the connection
    await client.close();
  }, 1000);

  // Test cancelling a connection attempt
  test('Cancel connection attempt', async () => {
    // Create a server that delays accepting connections
    const state = {
      pendingSocket: undefined as Socket | undefined,
    };
    const slowServer = createServer((socket) => {
      state.pendingSocket = socket;
      // We'll handle the socket manually later
    });

    // Start the server on port 0; read back the OS-assigned port
    const port = await new Promise<number>((resolve) => {
      slowServer.listen(0, () => {
        resolve((slowServer.address() as { port: number }).port);
      });
    });

    // Create client with a long timeout
    const client = new Hl7Client({
      host: 'localhost',
      port,
      connectTimeout: 1000, // Long enough that we can cancel before it times out
    });

    let err: Error | undefined;
    // Start connection but don't await it
    const pendingConnectPromise = client.connect().catch((_err) => {
      err = _err;
    });
    expect(pendingConnectPromise).toBeDefined();

    // Close the client immediately to cancel the connection
    await client.close();

    expect(err).toStrictEqual(new Error('Client closed while connecting'));

    // Stop the server
    await new Promise<void>((resolve) => {
      slowServer.close(() => resolve());
    });

    // Clean up any pending socket
    if (state.pendingSocket && !state.pendingSocket.destroyed) {
      state.pendingSocket.destroy();
    }
  }, 2000);

  // Test making multiple connection attempts in succession
  test('Multiple connection attempts do not create parallel connections', async () => {
    // Track connection count
    const state = {
      maxParallelConnections: 0,
      currentConnections: 0,
    };

    // Create a server that tracks connection counts
    const server = createServer((socket) => {
      state.currentConnections++;
      state.maxParallelConnections = Math.max(state.maxParallelConnections, state.currentConnections);

      socket.on('close', () => {
        state.currentConnections--;
      });
    });

    // Start the server on port 0; read back the OS-assigned port
    const port = await new Promise<number>((resolve) => {
      server.listen(0, () => {
        resolve((server.address() as { port: number }).port);
      });
    });

    // Create client with a moderate timeout
    const client = new Hl7Client({
      host: 'localhost',
      port,
      connectTimeout: 1000,
    });

    const connectionPromise = client.connect();

    // Make multiple connection attempts in rapid succession
    // Wait for all connection attempts to complete or fail
    const results = await Promise.allSettled([client.connect(), client.connect(), client.connect()]);

    // Get resolved connection from first promise for comparison with all the other results
    const connection = await connectionPromise;

    // All attempts to connect should resolve to the same connection
    expect(results).toMatchObject([
      expect.objectContaining({ status: 'fulfilled', value: connection }),
      expect.objectContaining({ status: 'fulfilled', value: connection }),
      expect.objectContaining({ status: 'fulfilled', value: connection }),
    ]);

    // Give some time for the server side listener to be invoked
    await sleep(500);

    // Sleep so that events can fire
    await sleep(0);

    // Cleanup
    await client.close();

    // Stop the server
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    // The fix should ensure only one connection is active at a time
    expect(state.maxParallelConnections).toBe(1);
  });

  // Test successful connection after timeout
  test('Can connect again after a timeout', async () => {
    // Start the server on port 0 just to claim an OS-assigned port, then stop it.
    // This is race-free: the port is assigned by the OS, we hold it until stop() returns,
    // and then immediately attempt a failing connect before any other process can claim it.
    const server = new Hl7Server((connection) => {
      connection.addEventListener('message', ({ message }) => {
        connection.send(message.buildAck());
      });
    });
    const port = await server.start(0);
    await server.stop();

    // Create a client with a very short timeout
    const client = new Hl7Client({
      host: 'localhost',
      port,
      connectTimeout: 100,
    });

    // First connection should fail (server was stopped)
    await expect(client.connect()).rejects.toThrow();

    // Restart the server on the same port
    await server.start(port);

    // Second connection attempt should succeed
    await client.connect();

    // Test that the connection works by sending a message
    const response = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      )
    );

    expect(response).toBeDefined();

    // Cleanup
    await client.close();
    await server.stop();
  });

  // Test case for reusing connection
  test('Reuses connection if already connected', async () => {
    // Track connection count
    let connectionCount = 0;

    // Create a server that tracks connection counts
    const server = new Hl7Server((connection) => {
      connectionCount++;
      connection.addEventListener('message', ({ message }) => {
        connection.send(message.buildAck());
      });
    });

    const port = await server.start(0);

    // Create client
    const client = new Hl7Client({
      host: 'localhost',
      port,
    });

    // Connect multiple times in sequence
    const conn1 = await client.connect();
    const conn2 = await client.connect();

    // Should reuse the same connection
    expect(conn1).toBe(conn2);

    // Send a message to verify the connection is working
    const response = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      )
    );

    expect(response).toBeDefined();

    // Cleanup
    await client.close();
    await server.stop();

    // Should only have seen one connection
    expect(connectionCount).toBe(1);
  });

  test('Creates new connection whenever connection is closed from other side and a new message is sent', async () => {
    let serverSideConnection!: Hl7Connection;

    // Create a server that tracks connection counts
    const server = new Hl7Server((connection) => {
      serverSideConnection = connection;
      connection.addEventListener('message', ({ message }) => {
        connection.send(message.buildAck());
      });
    });

    const port = await server.start(0);

    // Create client with keepAlive = true
    const client = new Hl7Client({
      host: 'localhost',
      port,
      keepAlive: true,
    });

    let ack = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      )
    );

    expect(ack).toBeDefined();

    // Register the listener before closing so we don't miss the event
    const clientClosedPromise = new Promise<void>((resolve) => {
      client.addEventListener('close', () => resolve(), { once: true });
    });

    await serverSideConnection.close();

    // Wait for the client to actually acknowledge the close, rather than using sleep(0).
    // sleep(0) uses setTimeout which fires in the timers phase, before the I/O poll phase where
    // the socket close event is processed — making sleep(0) an unreliable synchronization point.
    await clientClosedPromise;

    // Should succeed
    ack = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      )
    );

    expect(ack).toBeDefined();

    await client.close();
    await server.stop();
  });

  describe('Using MockSocket', () => {
    test('Does not fail many calls to sendAndWait in a row when connection is broken', async () => {
      // Scenario: Disconnected client gets a lot of calls to sendAndWait at once
      // Previously we would keep aborting connection attempts every time another call to `sendAndWait` is made since we always call connect
      // This test makes sure that if we call `sendAndWait` a lot that the one pending connection attempt is reused and all the calls resolve instead of all rejecting
      // Except for the last call which finally connects

      const clientMockSocket = new MockSocket();
      const serverMockSocket = new MockSocket();
      const mockServer = new MockServer();

      // Mock connect and createServer so we can wait to connect with a delay
      jest.spyOn(net, 'connect').mockImplementation(() => clientMockSocket as unknown as net.Socket);
      jest.spyOn(net, 'createServer').mockImplementation(((
        connectionListener?: (socket: net.Socket) => void
      ): net.Server => {
        mockServer.connectionListener = connectionListener as any;
        return mockServer as unknown as net.Server;
      }) as any);

      const hl7Server = new Hl7Server((connection) => {
        connection.addEventListener('message', (event) => {
          connection.send(event.message.buildAck());
        });
      });

      await hl7Server.start(9001);

      // Create client with keepAlive = true
      const client = new Hl7Client({
        host: 'localhost',
        port: 9001, // Port doesn't matter since we are mocking socket
        keepAlive: true,
      });

      const promises = [];
      for (let i = 0; i < 6; i++) {
        promises.push(
          client.sendAndWait(
            Hl7Message.parse(
              `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG0000${i + 1}|P|2.2\r` +
                'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
            )
          )
        );
        await sleep(50);
      }

      // Delayed connect for client after all calls to sendAndWait
      mockServer.mockConnect(clientMockSocket, serverMockSocket);

      await Promise.all(promises);
      await client.close();
      await hl7Server.stop();
    });
  });
});
