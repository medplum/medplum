import { AckCode, Hl7Message, isOperationOutcome, OperationOutcomeError, sleep } from '@medplum/core';
import { createServer, Socket } from 'node:net';
import { Hl7Client } from './client';
import { Hl7Connection, ReturnAckCategory } from './connection';
import { Hl7ErrorEvent } from './events';
import { Hl7Server } from './server';

describe('Hl7Client', () => {
  // Helper function to get a random port number
  // This helps avoid conflicts when running tests in parallel
  function getRandomPort(): number {
    return Math.floor(Math.random() * 10000) + 30000;
  }

  describe('sendAndWait', () => {
    const port = getRandomPort();
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
      hl7Server.start(port);
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
      hl7Client.close();
      // Sleep to let client cleanup
      await sleep(0);
    });

    afterAll(async () => {
      hl7Client.close();
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
      hl7Client.addEventListener('error', (event) => {
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
          closeErrorEvent = event as Hl7ErrorEvent;
        }
      });

      // Close the client while message is pending
      hl7Client.close();

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
          )
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
    const unreachablePort = getRandomPort();

    // Create client with a short timeout (500ms)
    const client = new Hl7Client({
      host: 'localhost',
      port: unreachablePort,
      connectTimeout: 500,
    });

    // Attempt to connect should fail with timeout error
    await expect(client.connect()).rejects.toThrow();

    // Cleanup
    client.close();
  });

  // Test sending to a non-responsive server
  test('Connection timeout when server does not respond', async () => {
    const port = getRandomPort();

    // Create client with a short timeout
    const client = new Hl7Client({
      host: '10.255.255.1', // Use an unreachable IP address
      port,
      connectTimeout: 500,
    });

    // Attempt to connect should fail with timeout error
    await expect(client.connect()).rejects.toThrow('Connection timeout after 500ms');

    // Close the connection
    client.close();
  }, 1000);

  // Test cancelling a connection attempt
  test('Cancel connection attempt', async () => {
    const port = getRandomPort();

    // Create a server that delays accepting connections
    const state = {
      pendingSocket: undefined as Socket | undefined,
    };
    const slowServer = createServer((socket) => {
      state.pendingSocket = socket;
      // We'll handle the socket manually later
    });

    // Start the server
    await new Promise<void>((resolve) => {
      slowServer.listen(port, () => resolve());
    });

    // Create client with a long timeout
    const client = new Hl7Client({
      host: 'localhost',
      port,
      connectTimeout: 1000, // Long enough that we can cancel before it times out
    });

    // Start connection but don't await it
    expect(client.connect()).toBeDefined();

    // Close the client immediately to cancel the connection
    client.close();

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
    const port = getRandomPort();

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

    // Start the server
    await new Promise<void>((resolve) => {
      server.listen(port, () => resolve());
    });

    // Create client with a moderate timeout
    const client = new Hl7Client({
      host: 'localhost',
      port,
      connectTimeout: 1000,
    });

    // Make multiple connection attempts in rapid succession
    const connect1 = client.connect().catch(() => null);
    // Don't wait for the first to complete
    const connect2 = client.connect().catch(() => null);
    const connect3 = client.connect().catch(() => null);

    // Wait for all connection attempts to complete or fail
    await Promise.race([connect1, connect2, connect3]);

    // Sleep so that events can fire
    await sleep(0);

    // Cleanup
    client.close();

    // Stop the server
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    // The fix should ensure only one connection is active at a time
    expect(state.maxParallelConnections).toBe(1);
  });

  // Test successful connection after timeout
  test('Can connect again after a timeout', async () => {
    const port = getRandomPort();

    // Create a client with a very short timeout
    const client = new Hl7Client({
      host: 'localhost',
      port,
      connectTimeout: 100,
    });

    // First connection should fail (no server)
    await expect(client.connect()).rejects.toThrow();

    // Now start a server
    const server = new Hl7Server((connection) => {
      connection.addEventListener('message', ({ message }) => {
        connection.send(message.buildAck());
      });
    });

    server.start(port);

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
    client.close();
    await server.stop();
  });

  // Test case for reusing connection
  test('Reuses connection if already connected', async () => {
    const port = getRandomPort();

    // Track connection count
    let connectionCount = 0;

    // Create a server that tracks connection counts
    const server = new Hl7Server((connection) => {
      connectionCount++;
      connection.addEventListener('message', ({ message }) => {
        connection.send(message.buildAck());
      });
    });

    server.start(port);

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
    client.close();
    await server.stop();

    // Should only have seen one connection
    expect(connectionCount).toBe(1);
  });

  test('Creates new connection whenever connection is closed from other side and a new message is sent', async () => {
    const port = getRandomPort();

    let serverSideConnection!: Hl7Connection;

    // Create a server that tracks connection counts
    const server = new Hl7Server((connection) => {
      serverSideConnection = connection;
      connection.addEventListener('message', ({ message }) => {
        connection.send(message.buildAck());
      });
    });

    server.start(port);

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

    serverSideConnection.close();

    // Need to sleep since close event are emitted on next tick
    await sleep(0);

    // Should succeed
    ack = await client.sendAndWait(
      Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      )
    );

    expect(ack).toBeDefined();

    client.close();
    await server.stop();
  });
});
