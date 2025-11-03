// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger, TypedEventTarget } from '@medplum/core';
import { Hl7Message, LogLevel } from '@medplum/core';
import { Hl7Server } from '@medplum/hl7';
import { EnhancedHl7Client } from './enhanced-hl7-client';

// Mock TypedEventTarget for heartbeat events
class MockHeartbeatEmitter {
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(event: string, listener: () => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener);
  }

  removeEventListener(event: string, listener: () => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string): void {
    this.listeners.get(event)?.forEach((listener) => listener());
  }

  getListenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

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

  let mockHeartbeatEmitter: MockHeartbeatEmitter;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockHeartbeatEmitter = new MockHeartbeatEmitter();
    mockLogger = {
      level: LogLevel.INFO,
      clone: jest.fn().mockImplementation(() => mockLogger),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        log: mockLogger,
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        log: mockLogger,
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        log: mockLogger,
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        log: mockLogger,
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        log: mockLogger,
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
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        log: mockLogger,
      });

      const firstStatsTracker = client.stats;
      expect(firstStatsTracker).toBeDefined();
      expect(mockHeartbeatEmitter.getListenerCount('heartbeat')).toBe(1);

      // Try to start tracking again
      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        log: mockLogger,
      });

      // Should still be the same stats tracker
      expect(client.stats).toBe(firstStatsTracker);
      // Should not have added another listener
      expect(mockHeartbeatEmitter.getListenerCount('heartbeat')).toBe(1);

      await client.close();
    });
  });

  describe('stopTrackingStats', () => {
    test('Calls cleanup on stats tracker when stopping', async () => {
      const client = new EnhancedHl7Client({
        host: 'localhost',
        port: 9999,
      });

      client.startTrackingStats({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        log: mockLogger,
      });

      expect(client.stats).toBeDefined();
      expect(mockHeartbeatEmitter.getListenerCount('heartbeat')).toBe(1);

      client.stopTrackingStats();

      // Cleanup should have removed the heartbeat listener
      expect(mockHeartbeatEmitter.getListenerCount('heartbeat')).toBe(0);

      await client.close();
    });

    test('Does not error when stopping tracking when not tracking', async () => {
      const client = new EnhancedHl7Client({
        host: 'localhost',
        port: 9999,
      });

      expect(client.stats).toBeUndefined();

      // Should not throw
      expect(() => client.stopTrackingStats()).not.toThrow();

      await client.close();
    });
  });
});
