// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Pool } from 'pg';
import * as databaseModule from '../database';
import { heartbeat } from '../heartbeat';
import {
  cleanupOtelHeartbeat,
  getGauge,
  incrementCounter,
  initOtelHeartbeat,
  recordHistogramValue,
  setGauge,
} from '../otel/otel';

// Create shared mock queue that all mocks will return
const createMockQueue = (): any => ({
  getWaitingCount: jest.fn().mockResolvedValue(5),
  getDelayedCount: jest.fn().mockResolvedValue(3),
});

const mockSharedQueue = createMockQueue();

// Mock worker modules before they're imported
jest.mock('../workers/subscription', () => ({
  getSubscriptionQueue: () => mockSharedQueue,
}));

jest.mock('../workers/cron', () => ({
  getCronQueue: () => mockSharedQueue,
}));

jest.mock('../workers/download', () => ({
  getDownloadQueue: () => mockSharedQueue,
}));

jest.mock('../workers/batch', () => ({
  getBatchQueue: () => mockSharedQueue,
}));

describe('OpenTelemetry', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...OLD_ENV };
    mockSharedQueue.getWaitingCount.mockClear();
    mockSharedQueue.getDelayedCount.mockClear();
  });

  afterAll(async () => {
    process.env = OLD_ENV;
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
    const heartbeatAddListenerSpy = jest.spyOn(heartbeat, 'addEventListener');
    const heartbeatRemoveListenerSpy = jest.spyOn(heartbeat, 'removeEventListener');

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

  test('Heartbeat listener records queue metrics for all 4 queues', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    const getDatabasePoolSpy = jest.spyOn(databaseModule, 'getDatabasePool').mockImplementation(
      () =>
        ({
          query: async () => undefined,
        }) as unknown as Pool
    );

    initOtelHeartbeat();

    heartbeat.dispatchEvent({ type: 'heartbeat' });

    // Wait for async heartbeat listener to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // We call getDatabasePool at the beginning of the listener callback
    expect(getDatabasePoolSpy).toHaveBeenCalled();

    // Check that the queue methods were called for all 4 queues (subscription, cron, download, batch)
    expect(mockSharedQueue.getWaitingCount).toHaveBeenCalledTimes(4);
    expect(mockSharedQueue.getDelayedCount).toHaveBeenCalledTimes(4);

    cleanupOtelHeartbeat();
  });
});
