// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { Hl7Message, TypedEventTarget } from '@medplum/core';
import { Hl7Server, ReturnAckCategory } from '@medplum/hl7';
import { EnhancedHl7Client } from './enhanced-hl7-client';
import { createMockLogger } from './test-utils';
import type { HeartbeatEmitter } from './types';

describe('EnhancedHl7Client', () => {
  const usedPorts = [] as number[];

  // Helper function to get a random port number
  function getRandomPort(): number {
    let port = Math.floor(Math.random() * 10000) + 40000;
    while (usedPorts.includes(port)) {
      port = Math.floor(Math.random() * 10000) + 40000;
    }
    usedPorts.push(port);
    return port;
  }

  let mockHeartbeatEmitter: HeartbeatEmitter;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockHeartbeatEmitter = new TypedEventTarget();
    mockLogger = createMockLogger();
  });

  describe('send with tracking off', () => {
    test('Send does not record stats when tracking is off', async () => {
      const port = getRandomPort();
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
      });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      await client.send(message);

      expect(client.stats).toBeUndefined();

      await client.close();
      await server.stop();
    });
  });

  describe('sendAndWait with tracking off', () => {
    test('SendAndWait does not record stats when tracking is off', async () => {
      const port = getRandomPort();
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
      });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      const response = await client.sendAndWait(message);

      expect(response).toBeDefined();
      expect(client.stats).toBeUndefined();

      await client.close();
      await server.stop();
    });
  });

  describe('send with tracking on', () => {
    test('Send records message sent when tracking is on', async () => {
      const port = getRandomPort();
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter,
      });

      expect(client.stats).toBeDefined();

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      await client.send(message);

      // Message should be recorded as pending
      expect(client.stats?.getPendingCount()).toBe(1);
      expect(client.stats?.getSampleCount()).toBe(0);

      await client.close();
      await server.stop();
    });

    test('Send does not record stats when message has no control ID', async () => {
      const port = getRandomPort();
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter,
      });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01||P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      await client.send(message);

      // No stats should be recorded
      expect(client.stats?.getPendingCount()).toBe(0);
      expect(client.stats?.getSampleCount()).toBe(0);

      await client.close();
      await server.stop();
    });
  });

  describe('sendAndWait with tracking on', () => {
    test('SendAndWait records RTT when tracking is on', async () => {
      const port = getRandomPort();
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter,
      });

      expect(client.stats).toBeDefined();

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      const response = await client.sendAndWait(message);

      expect(response).toBeDefined();

      // RTT should be recorded
      expect(client.stats?.getPendingCount()).toBe(0);
      expect(client.stats?.getSampleCount()).toBe(1);

      const stats = client.stats?.getRttStats();
      expect(stats?.count).toBe(1);
      expect(stats?.min).toBeGreaterThanOrEqual(0);
      expect(stats?.max).toBeGreaterThanOrEqual(0);

      await client.close();
      await server.stop();
    });

    test('sendAndWait records multiple RTT samples', async () => {
      const port = getRandomPort();
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter,
      });

      // Send multiple messages
      for (let i = 1; i <= 3; i++) {
        const message = Hl7Message.parse(
          `MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG0000${i}|P|2.2\r` +
            'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
        );

        await client.sendAndWait(message);
      }

      // All RTTs should be recorded
      expect(client.stats?.getPendingCount()).toBe(0);
      expect(client.stats?.getSampleCount()).toBe(3);
      expect(client.stats?.getRttSamples().length).toBe(3);

      const stats = client.stats?.getRttStats();
      expect(stats?.count).toBe(3);

      await client.close();
      await server.stop();
    });

    test('sendAndWait does not record stats when message has no control ID', async () => {
      const port = getRandomPort();
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter,
      });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01||P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      // sendAndWait throws an error when there's no control ID in the base class
      await expect(client.sendAndWait(message)).rejects.toThrow('Required field missing: MSH.10');

      // No stats should be recorded
      expect(client.stats?.getPendingCount()).toBe(0);
      expect(client.stats?.getSampleCount()).toBe(0);

      await client.close();
      await server.stop();
    });
  });

  describe('startTrackingStats', () => {
    test('Does not start tracking if already tracking', async () => {
      const client = new EnhancedHl7Client({
        host: 'localhost',
        port: 9999,
        log: mockLogger,
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter,
      });

      const firstStatsTracker = client.stats;
      expect(firstStatsTracker).toBeDefined();
      expect(mockHeartbeatEmitter.listenerCount('heartbeat')).toBe(1);

      // Try to start tracking again
      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter,
      });

      // Should still be the same stats tracker
      expect(client.stats).toBe(firstStatsTracker);
      // Should not have added another listener
      expect(mockHeartbeatEmitter.listenerCount('heartbeat')).toBe(1);

      await client.close();
    });
  });

  describe('stopTrackingStats', () => {
    test('Calls cleanup on stats tracker when stopping', async () => {
      const client = new EnhancedHl7Client({
        host: 'localhost',
        port: 9999,
        log: mockLogger,
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter,
      });

      expect(client.stats).toBeDefined();
      expect(mockHeartbeatEmitter.listenerCount('heartbeat')).toBe(1);

      client.stopTrackingStats();

      // Cleanup should have removed the heartbeat listener
      expect(mockHeartbeatEmitter.listenerCount('heartbeat')).toBe(0);

      await client.close();
    });

    test('Does not error when stopping tracking when not tracking', async () => {
      const client = new EnhancedHl7Client({
        host: 'localhost',
        port: 9999,
        log: mockLogger,
      });

      expect(client.stats).toBeUndefined();

      // Should not throw
      expect(() => client.stopTrackingStats()).not.toThrow();

      await client.close();
    });
  });

  describe('sendAndWait with returnAck options', () => {
    test('Passes returnAck option to parent sendAndWait', async () => {
      const port = getRandomPort();

      // Server sends CA first, then AA after a delay
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          // Send CA immediately
          const caAck = message.buildAck({ ackCode: 'CA' });
          connection.send(caAck);
          // Send AA after a short delay
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            connection.send(aaAck);
          }, 50);
        });
      });
      await server.start(port);

      const client = new EnhancedHl7Client({
        host: 'localhost',
        port,
        log: mockLogger,
      });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      // With returnAck: 'application', should wait for AA, not return on CA
      const response = await client.sendAndWait(message, { returnAck: ReturnAckCategory.APPLICATION });

      // Should have received AA, not CA
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString();
      expect(ackCode).toBe('AA');

      await client.close();
      await server.stop();
    });

    test('Default returnAck behavior returns first ACK (CA)', async () => {
      const port = getRandomPort();

      // Server sends CA first, then AA after a delay
      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          // Send CA immediately
          const caAck = message.buildAck({ ackCode: 'CA' });
          connection.send(caAck);
          // Send AA after a short delay
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            connection.send(aaAck);
          }, 50);
        });
      });
      await server.start(port);

      const client = new EnhancedHl7Client({
        host: 'localhost',
        port,
        log: mockLogger,
      });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      // With returnAck: 'first', should return on CA immediately
      const response = await client.sendAndWait(message, { returnAck: ReturnAckCategory.FIRST });

      // Should have received CA (the first ACK)
      const ackCode = response.getSegment('MSA')?.getField(1)?.toString();
      expect(ackCode).toBe('CA');

      await client.close();
      await server.stop();
    });

    test('sendAndWait records stats correctly with returnAck options', async () => {
      const port = getRandomPort();

      const server = new Hl7Server((connection) => {
        connection.addEventListener('message', ({ message }) => {
          const caAck = message.buildAck({ ackCode: 'CA' });
          connection.send(caAck);
          setTimeout(() => {
            const aaAck = message.buildAck({ ackCode: 'AA' });
            connection.send(aaAck);
          }, 50);
        });
      });
      await server.start(port);

      const client = new EnhancedHl7Client({
        host: 'localhost',
        port,
        log: mockLogger,
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter,
      });

      const message = Hl7Message.parse(
        'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
          'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-'
      );

      await client.sendAndWait(message, { returnAck: ReturnAckCategory.APPLICATION });

      // Stats should have been recorded
      expect(client.stats?.getSampleCount()).toBe(1);
      expect(client.stats?.getPendingCount()).toBe(0);

      await client.close();
      await server.stop();
    });
  });
});
