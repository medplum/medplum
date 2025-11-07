// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger, TypedEventTarget } from '@medplum/core';
import { LogLevel } from '@medplum/core';
import { ChannelStatsTracker } from './channel-stats-tracker';

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

describe('ChannelStatsTracker', () => {
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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getSampleCount', () => {
    test('Returns 0 initially', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      expect(tracker.getSampleCount()).toBe(0);
    });

    test('Returns correct count after adding samples', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      tracker.recordMessageSent('msg1');
      tracker.recordAckReceived('msg1');

      expect(tracker.getSampleCount()).toBe(1);

      tracker.recordMessageSent('msg2');
      tracker.recordAckReceived('msg2');

      expect(tracker.getSampleCount()).toBe(2);
    });
  });

  describe('getPendingCount', () => {
    test('Returns 0 initially', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      expect(tracker.getPendingCount()).toBe(0);
    });

    test('Returns correct count after sending messages', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      tracker.recordMessageSent('msg1');
      expect(tracker.getPendingCount()).toBe(1);

      tracker.recordMessageSent('msg2');
      expect(tracker.getPendingCount()).toBe(2);
    });

    test('Returns correct count after acknowledging messages', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      tracker.recordMessageSent('msg1');
      tracker.recordMessageSent('msg2');
      expect(tracker.getPendingCount()).toBe(2);

      tracker.recordAckReceived('msg1');
      expect(tracker.getPendingCount()).toBe(1);

      tracker.recordAckReceived('msg2');
      expect(tracker.getPendingCount()).toBe(0);
    });
  });

  describe('Adding samples', () => {
    test('Adds RTT samples when messages are acknowledged', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      tracker.recordMessageSent('msg1');
      jest.advanceTimersByTime(100);
      const rtt = tracker.recordAckReceived('msg1');

      expect(rtt).toBeGreaterThanOrEqual(100);
      expect(tracker.getSampleCount()).toBe(1);
      expect(tracker.getPendingCount()).toBe(0);
    });

    test('Returns undefined for acknowledgement without matching sent message', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      const rtt = tracker.recordAckReceived('nonexistent');

      expect(rtt).toBeUndefined();
      expect(tracker.getSampleCount()).toBe(0);
    });

    test('Calculates RTT correctly for multiple messages', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      tracker.recordMessageSent('msg1');
      jest.advanceTimersByTime(50);
      tracker.recordMessageSent('msg2');
      jest.advanceTimersByTime(50);

      const rtt1 = tracker.recordAckReceived('msg1');
      const rtt2 = tracker.recordAckReceived('msg2');

      expect(rtt1).toBeGreaterThanOrEqual(100);
      expect(rtt2).toBeGreaterThanOrEqual(50);
      expect(tracker.getSampleCount()).toBe(2);
    });
  });

  describe('Adding samples up to max capacity', () => {
    test('Maintains max sample limit and removes oldest', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        maxRttSamples: 3,
      });

      // Add 3 samples
      for (let i = 0; i < 3; i++) {
        tracker.recordMessageSent(`msg${i}`);
        jest.advanceTimersByTime(10 * (i + 1));
        tracker.recordAckReceived(`msg${i}`);
      }

      expect(tracker.getSampleCount()).toBe(3);
      let stats = tracker.getRttStats();
      expect(stats.count).toBe(3);
      expect(stats.min).toBeGreaterThanOrEqual(10);
      expect(stats.max).toBeGreaterThanOrEqual(30);

      // Add a 4th sample, should evict the oldest
      tracker.recordMessageSent('msg3');
      jest.advanceTimersByTime(50);
      tracker.recordAckReceived('msg3');

      expect(tracker.getSampleCount()).toBe(3);
      stats = tracker.getRttStats();
      expect(stats.count).toBe(3);
      // The oldest sample (~10ms) should be removed
      expect(stats.min).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Calculations', () => {
    test('Returns correct stats with no samples', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      const stats = tracker.getRttStats();

      expect(stats.count).toBe(0);
      expect(stats.min).toBe(-1);
      expect(stats.max).toBe(-1);
      expect(stats.average).toBe(-1);
      expect(stats.p50).toBe(-1);
      expect(stats.p95).toBe(-1);
      expect(stats.p99).toBe(-1);
      expect(stats.pendingCount).toBe(0);
    });

    test('Calculates correct stats with single sample', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      tracker.recordMessageSent('msg1');
      jest.advanceTimersByTime(100);
      tracker.recordAckReceived('msg1');

      const stats = tracker.getRttStats();

      expect(stats.count).toBe(1);
      expect(stats.min).toBeGreaterThanOrEqual(100);
      expect(stats.max).toBeGreaterThanOrEqual(100);
      expect(stats.average).toBeGreaterThanOrEqual(100);
      expect(stats.p50).toBeGreaterThanOrEqual(100);
      expect(stats.p95).toBeGreaterThanOrEqual(100);
      expect(stats.p99).toBeGreaterThanOrEqual(100);
      expect(stats.pendingCount).toBe(0);
    });

    test('Calculates correct stats with multiple samples', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      // Add samples with known RTT values: 100, 200, 300, 400, 500
      const expectedRtts = [100, 200, 300, 400, 500];
      for (let i = 0; i < expectedRtts.length; i++) {
        tracker.recordMessageSent(`msg${i}`);
        jest.advanceTimersByTime(expectedRtts[i]);
        tracker.recordAckReceived(`msg${i}`);
      }

      const stats = tracker.getRttStats();

      expect(stats.count).toBe(5);
      expect(stats.min).toBeGreaterThanOrEqual(100);
      expect(stats.max).toBeGreaterThanOrEqual(500);
      expect(stats.average).toBeGreaterThanOrEqual(300); // (100+200+300+400+500)/5 = 300
      expect(stats.p50).toBeGreaterThanOrEqual(300); // median
      expect(stats.p95).toBeGreaterThanOrEqual(500); // 95th percentile
      expect(stats.p99).toBeGreaterThanOrEqual(500); // 99th percentile
      expect(stats.pendingCount).toBe(0);
    });

    test('Includes pending count in stats', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      tracker.recordMessageSent('msg1');
      tracker.recordMessageSent('msg2');

      const stats = tracker.getRttStats();

      expect(stats.pendingCount).toBe(2);
    });
  });

  describe('Pending messages timeout', () => {
    test('Cleans up old pending messages via heartbeat', () => {
      const maxPendingAge = 5000; // 5 seconds
      const gcIntervalMs = 60000; // 1 minute
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        maxPendingAge,
        gcIntervalMs,
        log: mockLogger,
      });

      tracker.recordMessageSent('msg1');
      expect(tracker.getPendingCount()).toBe(1);

      // Advance time past maxPendingAge but not past gcIntervalMs
      jest.advanceTimersByTime(maxPendingAge + 1000);

      // Heartbeat should not trigger cleanup yet (hasn't been gcIntervalMs since last GC)
      mockHeartbeatEmitter.emit('heartbeat');
      expect(tracker.getPendingCount()).toBe(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();

      // Advance time past gcIntervalMs
      jest.advanceTimersByTime(gcIntervalMs);

      // Now heartbeat should trigger cleanup
      mockHeartbeatEmitter.emit('heartbeat');
      expect(tracker.getPendingCount()).toBe(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Cleaning up pending message; never got response for message with ID 'msg1'")
      );
    });

    test('Does not clean up recent pending messages', () => {
      const maxPendingAge = 5000; // 5 seconds
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        maxPendingAge,
        log: mockLogger,
      });

      tracker.recordMessageSent('msg1');
      expect(tracker.getPendingCount()).toBe(1);

      // Heartbeat triggers cleanup of old messages
      mockHeartbeatEmitter.emit('heartbeat');

      // Send another message, which triggers cleanup
      tracker.recordMessageSent('msg2');

      // Message should still be pending
      expect(tracker.getPendingCount()).toBe(2);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    test('Removes heartbeat listener when cleanup is called', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      expect(mockHeartbeatEmitter.getListenerCount('heartbeat')).toBe(1);

      tracker.cleanup();

      expect(mockHeartbeatEmitter.getListenerCount('heartbeat')).toBe(0);
    });

    test('Heartbeat listener does not trigger cleanup after cleanup is called', () => {
      const maxPendingAge = 5000;
      const gcIntervalMs = 1000;
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
        maxPendingAge,
        gcIntervalMs,
        log: mockLogger,
      });

      tracker.recordMessageSent('msg1');
      jest.advanceTimersByTime(maxPendingAge + gcIntervalMs + 1000);

      tracker.cleanup();

      // Emit heartbeat after cleanup
      mockHeartbeatEmitter.emit('heartbeat');

      // Message should still be pending (cleanup didn't run)
      expect(tracker.getPendingCount()).toBe(1);
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('Reset', () => {
    test('Clears all pending messages and samples', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      tracker.recordMessageSent('msg1');
      tracker.recordMessageSent('msg2');
      tracker.recordMessageSent('msg3');
      tracker.recordAckReceived('msg1');
      tracker.recordAckReceived('msg2');

      expect(tracker.getPendingCount()).toBe(1);
      expect(tracker.getSampleCount()).toBe(2);

      tracker.reset();

      expect(tracker.getPendingCount()).toBe(0);
      expect(tracker.getSampleCount()).toBe(0);
    });
  });

  describe('getStats', () => {
    test('returns channel stats with RTT stats', () => {
      const tracker = new ChannelStatsTracker({
        heartbeatEmitter: mockHeartbeatEmitter as unknown as TypedEventTarget<{ heartbeat: { type: 'heartbeat' } }>,
      });

      tracker.recordMessageSent('msg1');
      jest.advanceTimersByTime(100);
      tracker.recordAckReceived('msg1');

      const stats = tracker.getStats();

      expect(stats).toHaveProperty('rtt');
      expect(stats.rtt.count).toBe(1);
      expect(stats.rtt.pendingCount).toBe(0);
    });
  });
});
