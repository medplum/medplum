import { Hl7Message, sleep } from '@medplum/core';
import { createServer, Socket } from 'node:net';
import { Hl7Client } from './client';
import { Hl7Connection } from './connection';
import { Hl7Server } from './server';

describe('Hl7Client', () => {
  // Helper function to get a random port number
  // This helps avoid conflicts when running tests in parallel
  function getRandomPort(): number {
    return Math.floor(Math.random() * 10000) + 30000;
  }

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
      connectionCount: 0,
      maxParallelConnections: 0,
      currentConnections: 0,
    };

    // Create a server that tracks connection counts
    const server = createServer((socket) => {
      state.connectionCount++;
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
