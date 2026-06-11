// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
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
  cleanupOtelHeartbeat,
  getGauge,
  incrementCounter,
  initOtelHeartbeat,
  recordHistogramValue,
  setGauge,
} from './otel';

const createMockQueue = (): {
  getWaitingCount: ReturnType<typeof vi.fn>;
  getDelayedCount: ReturnType<typeof vi.fn>;
} => ({
  getWaitingCount: vi.fn().mockResolvedValue(5),
  getDelayedCount: vi.fn().mockResolvedValue(3),
});

let mockSharedQueue: ReturnType<typeof createMockQueue> | undefined = createMockQueue();

function mockQueueGetters(queue: ReturnType<typeof createMockQueue> | undefined): void {
  vi.spyOn(subscriptionModule, 'getSubscriptionQueue').mockReturnValue(queue as never);
  vi.spyOn(cronModule, 'getCronQueue').mockReturnValue(queue as never);
  vi.spyOn(downloadModule, 'getDownloadQueue').mockReturnValue(queue as never);
  vi.spyOn(batchModule, 'getBatchQueue').mockReturnValue(queue as never);
  vi.spyOn(setAccountsModule, 'getSetAccountsQueue').mockReturnValue(queue as never);
}

describe('OpenTelemetry', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    mockSharedQueue = createMockQueue();
    mockQueueGetters(mockSharedQueue);
    cleanupOtelHeartbeat();
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

  test('initOtelHeartbeat', () => {
    const heartbeatAddListenerSpy = vi.spyOn(heartbeat, 'addEventListener');
    const heartbeatRemoveListenerSpy = vi.spyOn(heartbeat, 'removeEventListener');

    initOtelHeartbeat();
    expect(heartbeatAddListenerSpy).toHaveBeenCalled();

    heartbeatAddListenerSpy.mockClear();

    initOtelHeartbeat();
    expect(heartbeatAddListenerSpy).not.toHaveBeenCalled();

    cleanupOtelHeartbeat();
    expect(heartbeatRemoveListenerSpy).toHaveBeenCalled();

    heartbeatRemoveListenerSpy.mockClear();

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
    await sleep(0);

    expect(getDatabasePoolSpy).toHaveBeenCalled();
    expect(mockSharedQueue.getWaitingCount).toHaveBeenCalledTimes(5);
    expect(mockSharedQueue.getDelayedCount).toHaveBeenCalledTimes(5);

    cleanupOtelHeartbeat();
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

    initOtelHeartbeat();

    heartbeat.dispatchEvent({ type: 'heartbeat' });
    await sleep(0);

    expect(mockSharedQueue.getWaitingCount).toHaveBeenCalled();
    expect(mockSharedQueue.getDelayedCount).toHaveBeenCalled();

    mockSharedQueue.getWaitingCount.mockClear();
    mockSharedQueue.getDelayedCount.mockClear();

    mockQueueGetters(undefined);

    heartbeat.dispatchEvent({ type: 'heartbeat' });
    await sleep(0);

    expect(getDatabasePoolSpy).toHaveBeenCalled();

    cleanupOtelHeartbeat();
    getDatabasePoolSpy.mockRestore();
  });
});
