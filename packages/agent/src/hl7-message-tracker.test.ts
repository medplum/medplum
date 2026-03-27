// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { Hl7Message, ReturnAckCategory, sleep, TypedEventTarget } from '@medplum/core';
import type { Hl7Connection } from '@medplum/hl7';
import { Hl7Server } from '@medplum/hl7';
import { EnhancedHl7Client } from './enhanced-hl7-client';
import { Hl7ClientPool } from './hl7-client-pool';
import { Hl7MessageTracker } from './hl7-message-tracker';
import { createMockLogger } from './test-utils';
import type { HeartbeatEmitter } from './types';

describe('Hl7MessageTracker', () => {
  describe('basic operations', () => {
    test('setPendingMessage and getPendingMessage', () => {
      const tracker = new Hl7MessageTracker();
      const item = {
        message: Hl7Message.parse('MSH|^~\\&|A|B|C|D|202301011200||ADT^A01|MSG001|P|2.5'),
        resolve: jest.fn(),
        reject: jest.fn(),
        returnAck: ReturnAckCategory.FIRST,
      };

      tracker.setPendingMessage('MSG001', item);
      expect(tracker.getPendingMessage('MSG001')).toBe(item);
      expect(tracker.getPendingMessageCount()).toBe(1);
    });

    test('getPendingMessage returns undefined for unknown ID', () => {
      const tracker = new Hl7MessageTracker();
      expect(tracker.getPendingMessage('UNKNOWN')).toBeUndefined();
    });

    test('deletePendingMessage removes entry', () => {
      const tracker = new Hl7MessageTracker();
      const item = {
        message: Hl7Message.parse('MSH|^~\\&|A|B|C|D|202301011200||ADT^A01|MSG001|P|2.5'),
        resolve: jest.fn(),
        reject: jest.fn(),
        returnAck: ReturnAckCategory.FIRST,
      };

      tracker.setPendingMessage('MSG001', item);
      tracker.deletePendingMessage('MSG001');
      expect(tracker.getPendingMessage('MSG001')).toBeUndefined();
      expect(tracker.getPendingMessageCount()).toBe(0);
    });

    test('deletePendingMessage is safe for unknown ID', () => {
      const tracker = new Hl7MessageTracker();
      expect(() => tracker.deletePendingMessage('UNKNOWN')).not.toThrow();
    });

    test('drainAll rejects all pending messages and clears timers', () => {
      const tracker = new Hl7MessageTracker();

      const reject1 = jest.fn();
      const reject2 = jest.fn();
      const timer1 = setTimeout(() => {}, 60000);
      const clearSpy = jest.spyOn(global, 'clearTimeout');

      tracker.setPendingMessage('MSG001', {
        message: Hl7Message.parse('MSH|^~\\&|A|B|C|D|202301011200||ADT^A01|MSG001|P|2.5'),
        resolve: jest.fn(),
        reject: reject1,
        returnAck: ReturnAckCategory.FIRST,
        timer: timer1,
      });
      tracker.setPendingMessage('MSG002', {
        message: Hl7Message.parse('MSH|^~\\&|A|B|C|D|202301011200||ADT^A01|MSG002|P|2.5'),
        resolve: jest.fn(),
        reject: reject2,
        returnAck: ReturnAckCategory.FIRST,
      });

      tracker.drainAll();

      expect(reject1).toHaveBeenCalledTimes(1);
      expect(reject2).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledWith(timer1);
      expect(tracker.getPendingMessageCount()).toBe(0);

      clearSpy.mockRestore();
    });

    test('drainAll is safe when empty', () => {
      const tracker = new Hl7MessageTracker();
      expect(() => tracker.drainAll()).not.toThrow();
    });
  });

  describe('TrackedHl7Connection via EnhancedHl7Client', () => {
    const usedPorts = [] as number[];

    function getRandomPort(): number {
      let port = Math.floor(Math.random() * 10000) + 41000;
      while (usedPorts.includes(port)) {
        port = Math.floor(Math.random() * 10000) + 41000;
      }
      usedPorts.push(port);
      return port;
    }

    let mockLogger: ILogger;

    beforeEach(() => {
      mockLogger = createMockLogger();
    });

    test('sendAndWait resolves via shared tracker', async () => {
      const port = getRandomPort();
      const tracker = new Hl7MessageTracker();

      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });
      await server.start(port);

      const client = new EnhancedHl7Client({
        host: 'localhost',
        port,
        log: mockLogger,
        messageTracker: tracker,
      });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      const response = await client.sendAndWait(message);
      expect(response).toBeDefined();

      // After resolving, the tracker should have no pending messages
      expect(tracker.getPendingMessageCount()).toBe(0);

      await client.close();
      await server.stop();
    });

    test('pending messages survive connection close when using tracker', async () => {
      const port = getRandomPort();
      const tracker = new Hl7MessageTracker();
      // Server that does NOT send any ACK — messages will stay pending
      const server = new Hl7Server(() => {
        // Intentionally no ACK
      });
      await server.start(port);

      const client = new EnhancedHl7Client({
        host: 'localhost',
        port,
        log: mockLogger,
        messageTracker: tracker,
      });

      // Establish the connection first to avoid timing issues
      await client.connect();

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      // Start sending but don't await (no ACK will come)
      const rejectSpy = jest.fn();
      const sendPromise = client.sendAndWait(message).catch(rejectSpy);

      // Wait for microtasks to settle (setPendingMessage is called synchronously
      // once the awaited connect() resolves, which it does immediately here)
      await sleep(0);

      // Verify tracker has the pending message
      expect(tracker.getPendingMessageCount()).toBe(1);

      // Close the client — with a tracker, the promise should NOT be rejected
      await client.close();

      // The message should still be in the tracker (not drained)
      expect(tracker.getPendingMessageCount()).toBe(1);
      expect(rejectSpy).not.toHaveBeenCalled();

      // Now drain the tracker — this should reject the promise
      tracker.drainAll();

      // Wait for the rejection to propagate
      await sendPromise;

      expect(rejectSpy).toHaveBeenCalledTimes(1);
      expect(tracker.getPendingMessageCount()).toBe(0);

      await server.stop();
    });

    test('second connection resolves message tracked by first connection', async () => {
      const port = getRandomPort();
      const tracker = new Hl7MessageTracker();

      // Server that only ACKs messages from the second connection onwards
      let connectionCount = 0;
      const server = new Hl7Server((connection) => {
        connectionCount++;
        const connNum = connectionCount;
        connection.addEventListener('message', ({ message }) => {
          // Only ACK on the second connection
          if (connNum >= 2) {
            connection.send(message.buildAck());
          }
        });
      });
      await server.start(port);

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      // First client sends a message and registers it in the tracker — no ACK comes back
      const client1 = new EnhancedHl7Client({
        host: 'localhost',
        port,
        log: mockLogger,
        messageTracker: tracker,
      });

      // Manually register the message in the tracker with a promise we control
      const msgCtrlId = message.getSegment('MSH')?.getField(10)?.toString() as string;
      const resultPromise = new Promise<Hl7Message>((resolve, reject) => {
        tracker.setPendingMessage(msgCtrlId, {
          message,
          resolve,
          reject,
          returnAck: ReturnAckCategory.FIRST, // FIRST
        });
      });

      // Send the raw message via client1 (not sendAndWait, since we manually registered)
      await client1.send(message);
      expect(tracker.getPendingMessageCount()).toBe(1);

      // Close client1 — tracker should keep the message
      await client1.close();
      expect(tracker.getPendingMessageCount()).toBe(1);

      // Second client connects and sends the same message — server ACKs this time
      const client2 = new EnhancedHl7Client({
        host: 'localhost',
        port,
        log: mockLogger,
        messageTracker: tracker,
      });

      // Send the same message on client2 — the server ACKs it
      // The ACK arrives on client2's tracked connection, which looks up the shared tracker
      await client2.send(message);

      // Wait for the ACK to arrive and resolve the original promise
      const result = await resultPromise;
      expect(result).toBeDefined();
      expect(result.getSegment('MSA')?.getField(1)?.toString()).toBe('AA');
      expect(tracker.getPendingMessageCount()).toBe(0);

      await client2.close();
      await server.stop();
    });

    test('pool recovers from server-side close and new client resolves original push via tracker', async () => {
      const port = getRandomPort();
      const tracker = new Hl7MessageTracker();
      const mockHeartbeatEmitter: HeartbeatEmitter = new TypedEventTarget();

      // Server captures the original message on the first connection, then
      // force-closes it. When a second connection opens, the server delivers
      // the ACK for the original message without the client re-sending.
      const serverConnections: Hl7Connection[] = [];
      let capturedMessage: Hl7Message | undefined;
      let connectionCount = 0;
      const server = new Hl7Server((connection) => {
        connectionCount++;
        serverConnections.push(connection);
        const connNum = connectionCount;

        if (connNum >= 2 && capturedMessage) {
          // Second connection: immediately deliver the ACK for the original message
          connection.send(capturedMessage.buildAck());
        }

        connection.addEventListener('message', ({ message }) => {
          if (connNum === 1) {
            // First connection: capture the message but don't ACK
            capturedMessage = message;
          }
        });
      });
      await server.start(port);

      const pool = new Hl7ClientPool({
        host: 'localhost',
        port,
        keepAlive: true,
        maxClients: 1,
        log: mockLogger,
        heartbeatEmitter: mockHeartbeatEmitter,
        messageTracker: tracker,
      });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      // Get a client from the pool and start the "agent push" (sendAndWait)
      const client1 = pool.getClient();
      const pushPromise = client1.sendAndWait(message);

      // Wait for the message to be sent over TCP and registered in the tracker
      while (serverConnections.length < 1) {
        await sleep(10);
      }
      await sleep(50);
      expect(tracker.getPendingMessageCount()).toBe(1);
      expect(pool.size()).toBe(1);

      // Server force-closes the first connection (simulating a network drop)
      await serverConnections[0].close();

      // Wait for the close event to propagate through the client and pool
      while (pool.size() !== 0) {
        await sleep(10);
      }

      // Client1 was removed from the pool, but tracker still has the pending message
      expect(pool.size()).toBe(0);
      expect(tracker.getPendingMessageCount()).toBe(1);

      // A new client connects — pool creates it. The server immediately sends
      // the ACK for the original message on this new connection (no re-send).
      const client2 = pool.getClient();
      expect(client2).not.toBe(client1);
      expect(pool.size()).toBe(1);

      // Just connecting is enough — trigger the connection so the server handler fires
      await client2.connect();

      // The ACK arrives on client2's tracked connection and resolves the original push promise
      const response = await pushPromise;
      expect(response).toBeDefined();
      expect(response.getSegment('MSA')?.getField(1)?.toString()).toBe('AA');
      expect(tracker.getPendingMessageCount()).toBe(0);

      pool.releaseClient(client2);
      await pool.closeAll();
      await server.stop();
    });

    test('pending messages with timeout still timeout after client is closed', async () => {
      const port = getRandomPort();
      const tracker = new Hl7MessageTracker();

      // Server that does NOT send any ACK
      const server = new Hl7Server(() => {
        // Intentionally no ACK
      });
      await server.start(port);

      const client = new EnhancedHl7Client({
        host: 'localhost',
        port,
        log: mockLogger,
        messageTracker: tracker,
      });

      // Establish connection first
      await client.connect();

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      // Send with a short timeout
      const rejectSpy = jest.fn();
      const sendPromise = client.sendAndWait(message, { timeoutMs: 200 }).catch(rejectSpy);

      // Wait for the message to be registered in the tracker
      await sleep(0);
      expect(tracker.getPendingMessageCount()).toBe(1);

      // Close the client — with tracker, promise is NOT rejected immediately
      await client.close();
      expect(tracker.getPendingMessageCount()).toBe(1);
      expect(rejectSpy).not.toHaveBeenCalled();

      // Wait for the timeout to fire (> 200ms)
      await sleep(300);

      // The timeout should have fired and rejected the promise, even though the client is closed
      await sendPromise;
      expect(rejectSpy).toHaveBeenCalledTimes(1);

      // The tracker should have cleaned up the message
      expect(tracker.getPendingMessageCount()).toBe(0);

      await server.stop();
    });

    test('stats tracking works with message tracker', async () => {
      const port = getRandomPort();
      const tracker = new Hl7MessageTracker();
      const mockHeartbeatEmitter: HeartbeatEmitter = new TypedEventTarget();

      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          connection.send(message.buildAck());
        });
      });
      await server.start(port);

      const client = new EnhancedHl7Client({
        host: 'localhost',
        port,
        log: mockLogger,
        messageTracker: tracker,
      });

      client.startTrackingStats({ heartbeatEmitter: mockHeartbeatEmitter });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      const response = await client.sendAndWait(message);
      expect(response).toBeDefined();

      expect(client.stats?.getSampleCount()).toBe(1);
      expect(client.stats?.getPendingCount()).toBe(0);
      expect(tracker.getPendingMessageCount()).toBe(0);

      await client.close();
      await server.stop();
    });
  });
});
