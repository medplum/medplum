// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import type { Meter } from '@opentelemetry/api';
import { metrics } from '@opentelemetry/api';
import type { Pool } from 'pg';
import { vi } from 'vitest';
import * as databaseModule from '../database';
import { heartbeat } from '../heartbeat';
import * as batchModule from '../workers/batch';
import * as cronModule from '../workers/cron';
import * as downloadModule from '../workers/download';
import * as setAccountsModule from '../workers/set-accounts';
import * as subscriptionModule from '../workers/subscription';
import {
  addToUpDownCounter,
  cleanupOtelHeartbeat,
  getGauge,
  getQueueMetricName,
  getUpDownCounter,
  incrementCounter,
  initOtelHeartbeat,
  recordHistogramValue,
  setGauge,
  setRateGauge,
} from './otel';

const createMockQueue = (): {
  getWaitingCount: ReturnType<typeof vi.fn>;
  getDelayedCount: ReturnType<typeof vi.fn>;
  getActiveCount: ReturnType<typeof vi.fn>;
} => ({
  getWaitingCount: vi.fn().mockResolvedValue(5),
  getDelayedCount: vi.fn().mockResolvedValue(3),
  getActiveCount: vi.fn().mockResolvedValue(2),
});

let mockSharedQueue: ReturnType<typeof createMockQueue> | undefined = createMockQueue();

// Without a registered SDK, `metrics.getMeter()` hands back a no-op meter that returns the SAME
// instrument singleton for every metric name, so spying on an instrument cannot tell one metric from
// another. Mock the meter instead so each name gets its own mock, and recorded values can be asserted
// per metric. Instruments are memoized by name in otel.ts, so this must be installed before the first
// instrument is created.
const gaugeRecorders = new Map<string, ReturnType<typeof vi.fn>>();

function gaugeRecorder(name: string): ReturnType<typeof vi.fn> {
  let record = gaugeRecorders.get(name);
  if (!record) {
    record = vi.fn();
    gaugeRecorders.set(name, record);
  }
  return record;
}

function mockQueueGetters(queue: ReturnType<typeof createMockQueue> | undefined): void {
  vi.spyOn(subscriptionModule, 'getSubscriptionQueue').mockReturnValue(queue as never);
  vi.spyOn(cronModule, 'getCronQueue').mockReturnValue(queue as never);
  vi.spyOn(downloadModule, 'getDownloadQueue').mockReturnValue(queue as never);
  vi.spyOn(batchModule, 'getBatchQueue').mockReturnValue(queue as never);
  vi.spyOn(setAccountsModule, 'getSetAccountsQueue').mockReturnValue(queue as never);
}

describe('OpenTelemetry', () => {
  const OLD_ENV = process.env;

  beforeAll(() => {
    vi.spyOn(metrics, 'getMeter').mockReturnValue({
      createCounter: () => ({ add: vi.fn() }),
      createHistogram: () => ({ record: vi.fn() }),
      createUpDownCounter: () => ({ add: vi.fn() }),
      createGauge: (name: string) => ({ record: gaugeRecorder(name) }),
    } as unknown as Meter);
  });

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    // Reset mockSharedQueue to a fresh queue for each test
    mockSharedQueue = createMockQueue();
    mockQueueGetters(mockSharedQueue);
    cleanupOtelHeartbeat();
    for (const record of gaugeRecorders.values()) {
      record.mockClear();
    }
  });

  afterAll(async () => {
    process.env = OLD_ENV;
    cleanupOtelHeartbeat();
    vi.restoreAllMocks();
  });

  test('Increment counter, disabled', async () => {
    expect(incrementCounter('test')).toBe(false);
  });

  test('Increment counter, enabled', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(incrementCounter('test')).toBe(true);
  });

  test('Increment counter, enabled, attributes specified', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(incrementCounter('test', { attributes: { hostname: 'https://example.com' } })).toBe(true);
  });

  test('Increment counter, enabled, options specified', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(incrementCounter('test', { options: { unit: 's' } })).toBe(true);
  });

  test('Record histogram value, disabled', async () => {
    expect(recordHistogramValue('test', 1)).toBe(false);
  });

  test('Record histogram value, enabled', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(recordHistogramValue('test', 1)).toBe(true);
  });

  test('Record histogram value, enabled, attributes specified', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(recordHistogramValue('test', 1, { attributes: { hostname: 'https://example.com' } })).toBe(true);
  });

  test('Record histogram value, enabled, options specified', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(recordHistogramValue('test', 1, { options: { unit: 's' } })).toBe(true);
  });

  test('Set gauge, disabled', async () => {
    expect(setGauge('test', 1)).toBe(false);
  });

  test('Set gauge, enabled', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(setGauge('test', 1)).toBe(true);
  });

  test('Set gauge, enabled, attributes specified', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(setGauge('test', 1, { attributes: { hostname: 'https://example.com' } })).toBe(true);
  });

  test('Set gauge, enabled, options specified', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(setGauge('test', 1, { options: { unit: 's' } })).toBe(true);
    getGauge('test');
  });

  test('Get queue metric name', () => {
    expect(getQueueMetricName('batch', 'activeCount')).toBe('medplum.batch.activeCount');
    expect(getQueueMetricName('set-accounts', 'waitingCount')).toBe('medplum.set-accounts.waitingCount');
    expect(getQueueMetricName('subscription', 'inFlightJobs')).toBe('medplum.subscription.inFlightJobs');
  });

  test('Add to up down counter, disabled', async () => {
    expect(addToUpDownCounter('test', 1)).toBe(false);
  });

  test('Add to up down counter, enabled', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(addToUpDownCounter('test', 1)).toBe(true);
    expect(addToUpDownCounter('test', -1)).toBe(true);
  });

  test('Add to up down counter, enabled, attributes and options specified', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    expect(addToUpDownCounter('test', 1, { attributes: { queue: 'batch' }, options: { unit: '{job}' } })).toBe(true);
    getUpDownCounter('test');
  });

  test('Set rate gauge, disabled', async () => {
    expect(setRateGauge('test.rate', 1)).toBe(false);
  });

  describe('Set rate gauge, enabled', () => {
    const metricName = 'medplum.test.rate';
    const recordSpy = gaugeRecorder(metricName);
    let nowSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
      nowSpy = vi.spyOn(Date, 'now');
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    test('First sample only establishes a baseline', () => {
      nowSpy.mockReturnValue(10_000);
      expect(setRateGauge(metricName, 100)).toBe(false);
      expect(recordSpy).not.toHaveBeenCalled();
    });

    test('Divides the delta by the elapsed interval', () => {
      nowSpy.mockReturnValue(10_000);
      setRateGauge(metricName, 100);

      // 40 more over 4 seconds is 10 per second.
      nowSpy.mockReturnValue(14_000);
      expect(setRateGauge(metricName, 140)).toBe(true);
      expect(recordSpy).toHaveBeenCalledWith(10, undefined);
    });

    test('Reports zero when the total did not move', () => {
      nowSpy.mockReturnValue(10_000);
      setRateGauge(metricName, 100);

      nowSpy.mockReturnValue(20_000);
      expect(setRateGauge(metricName, 100)).toBe(true);
      expect(recordSpy).toHaveBeenCalledWith(0, undefined);
    });

    test('Reports zero rather than a negative rate when the total went backwards', () => {
      nowSpy.mockReturnValue(10_000);
      setRateGauge(metricName, 100);

      // e.g. the process restarted and its running total reset.
      nowSpy.mockReturnValue(20_000);
      expect(setRateGauge(metricName, 5)).toBe(true);
      expect(recordSpy).toHaveBeenCalledWith(0, undefined);
    });

    test('Skips samples taken within the same millisecond', () => {
      nowSpy.mockReturnValue(10_000);
      setRateGauge(metricName, 100);

      expect(setRateGauge(metricName, 150)).toBe(false);
      expect(recordSpy).not.toHaveBeenCalled();
    });

    test('Baselines are dropped on cleanup so a restarted heartbeat does not use a stale interval', () => {
      nowSpy.mockReturnValue(10_000);
      setRateGauge(metricName, 100);

      cleanupOtelHeartbeat();

      nowSpy.mockReturnValue(14_000);
      expect(setRateGauge(metricName, 140)).toBe(false);
      expect(recordSpy).not.toHaveBeenCalled();
    });
  });

  test('initOtelHeartbeat', () => {
    const heartbeatAddListenerSpy = vi.spyOn(heartbeat, 'addEventListener');
    const heartbeatRemoveListenerSpy = vi.spyOn(heartbeat, 'removeEventListener');

    // Init otel heartbeat
    initOtelHeartbeat();
    expect(heartbeatAddListenerSpy).toHaveBeenCalled();

    heartbeatAddListenerSpy.mockClear();

    // Call init again, no-op
    initOtelHeartbeat();
    expect(heartbeatAddListenerSpy).not.toHaveBeenCalled();

    // Cleanup heartbeat
    cleanupOtelHeartbeat();
    expect(heartbeatRemoveListenerSpy).toHaveBeenCalled();

    heartbeatRemoveListenerSpy.mockClear();

    // Cleanup heartbeat again, no-op
    cleanupOtelHeartbeat();
    expect(heartbeatRemoveListenerSpy).not.toHaveBeenCalled();
  });

  test('Heartbeat listener records queue metrics for all queues', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    if (!mockSharedQueue) {
      throw new Error('Expected mock queue');
    }

    const getDatabasePoolSpy = vi.spyOn(databaseModule, 'getDatabasePool').mockImplementation(
      () =>
        ({
          query: async () => undefined,
        }) as unknown as Pool
    );

    initOtelHeartbeat();

    heartbeat.dispatchEvent({ type: 'heartbeat' });

    // Wait for heartbeat listener callback next tick
    await sleep(0);

    // We call getDatabasePool at the beginning of the listener callback
    expect(getDatabasePoolSpy).toHaveBeenCalled();

    // Check that the queue methods were called for all 5 queues
    // (subscription, cron, download, batch, set-accounts)
    expect(mockSharedQueue.getWaitingCount).toHaveBeenCalledTimes(5);
    expect(mockSharedQueue.getDelayedCount).toHaveBeenCalledTimes(5);
    expect(mockSharedQueue.getActiveCount).toHaveBeenCalledTimes(5);

    cleanupOtelHeartbeat();
    getDatabasePoolSpy.mockRestore();
  });

  test('Heartbeat listener records async batch throughput rates', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    const getDatabasePoolSpy = vi.spyOn(databaseModule, 'getDatabasePool').mockImplementation(
      () =>
        ({
          query: async () => undefined,
        }) as unknown as Pool
    );
    const totalsSpy = vi
      .spyOn(batchModule, 'getBatchThroughputTotals')
      .mockReturnValue({ completedJobs: 0, processedEntries: 0 });
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(100_000);
    const completedRecordSpy = gaugeRecorder('medplum.batch.completedPerSecond');
    const entriesRecordSpy = gaugeRecorder('medplum.batch.entriesPerSecond');

    initOtelHeartbeat();

    // The first heartbeat only establishes the rate baselines.
    heartbeat.dispatchEvent({ type: 'heartbeat' });
    await sleep(0);
    expect(completedRecordSpy).not.toHaveBeenCalled();
    expect(entriesRecordSpy).not.toHaveBeenCalled();

    // 6 jobs and 300 entries over the next 10 seconds.
    totalsSpy.mockReturnValue({ completedJobs: 6, processedEntries: 300 });
    nowSpy.mockReturnValue(110_000);
    heartbeat.dispatchEvent({ type: 'heartbeat' });
    await sleep(0);

    const expectedAttributes = { hostname: expect.any(String) };
    expect(completedRecordSpy).toHaveBeenCalledWith(0.6, expectedAttributes);
    expect(entriesRecordSpy).toHaveBeenCalledWith(30, expectedAttributes);

    cleanupOtelHeartbeat();
    nowSpy.mockRestore();
    totalsSpy.mockRestore();
    getDatabasePoolSpy.mockRestore();
  });

  test('Heartbeat listener skips queue collection when queues return undefined', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';
    if (!mockSharedQueue) {
      throw new Error('Expected mock queue');
    }

    const getDatabasePoolSpy = vi.spyOn(databaseModule, 'getDatabasePool').mockImplementation(
      () =>
        ({
          query: async () => undefined,
        }) as unknown as Pool
    );

    // Initialize heartbeat with valid queues first
    initOtelHeartbeat();

    // Trigger one heartbeat with valid queues to initialize queueEntries
    heartbeat.dispatchEvent({ type: 'heartbeat' });
    await sleep(0);

    // Verify queue methods were called
    expect(mockSharedQueue.getWaitingCount).toHaveBeenCalled();
    expect(mockSharedQueue.getDelayedCount).toHaveBeenCalled();

    // Clear the mock calls
    mockSharedQueue.getWaitingCount.mockClear();
    mockSharedQueue.getDelayedCount.mockClear();

    // Now set mockSharedQueue to undefined for subsequent calls
    mockQueueGetters(undefined);

    // Trigger another heartbeat - should skip queue collection but not crash
    heartbeat.dispatchEvent({ type: 'heartbeat' });
    await sleep(0);

    // Database pool should still be called
    expect(getDatabasePoolSpy).toHaveBeenCalled();

    cleanupOtelHeartbeat();
    getDatabasePoolSpy.mockRestore();
  });
});
