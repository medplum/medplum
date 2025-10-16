// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
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

// Dynamic getter for mock queue - can be changed per test
let mockSharedQueue: any = createMockQueue();
const getMockSharedQueue = (): any => mockSharedQueue;

// Mock worker modules before they're imported
jest.mock('../workers/subscription', () => ({
  getSubscriptionQueue: () => getMockSharedQueue(),
}));

jest.mock('../workers/cron', () => ({
  getCronQueue: () => getMockSharedQueue(),
}));

jest.mock('../workers/download', () => ({
  getDownloadQueue: () => getMockSharedQueue(),
}));

jest.mock('../workers/batch', () => ({
  getBatchQueue: () => getMockSharedQueue(),
}));

describe('OpenTelemetry', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...OLD_ENV };
    // Reset mockSharedQueue to a fresh queue for each test
    mockSharedQueue = createMockQueue();
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

    // Wait for heartbeat listener callback next tick
    await sleep(0);

    // We call getDatabasePool at the beginning of the listener callback
    expect(getDatabasePoolSpy).toHaveBeenCalled();

    // Check that the queue methods were called for all 4 queues (subscription, cron, download, batch)
    expect(mockSharedQueue.getWaitingCount).toHaveBeenCalledTimes(4);
    expect(mockSharedQueue.getDelayedCount).toHaveBeenCalledTimes(4);

    cleanupOtelHeartbeat();
  });

  test('Heartbeat listener skips queue collection when queues return undefined', async () => {
    process.env.OTLP_METRICS_ENDPOINT = 'http://localhost:4318/v1/metrics';

    const getDatabasePoolSpy = jest.spyOn(databaseModule, 'getDatabasePool').mockImplementation(
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
    mockSharedQueue = undefined;

    // Trigger another heartbeat - should skip queue collection but not crash
    heartbeat.dispatchEvent({ type: 'heartbeat' });
    await sleep(0);

    // Database pool should still be called
    expect(getDatabasePoolSpy).toHaveBeenCalled();

    cleanupOtelHeartbeat();
  });
});
