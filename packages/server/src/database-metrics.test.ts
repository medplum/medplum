// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EventEmitter } from 'node:events';
import os from 'node:os';
import type { Pool, PoolClient } from 'pg';
import { vi } from 'vitest';
import { instrumentDatabasePool, recordDatabaseTransaction } from './database-metrics';

const { incrementCounterMock, recordHistogramValueMock } = vi.hoisted(() => ({
  incrementCounterMock: vi.fn(() => true),
  recordHistogramValueMock: vi.fn(() => true),
}));

vi.mock('./otel/metrics', () => ({
  incrementCounter: incrementCounterMock,
  recordHistogramValue: recordHistogramValueMock,
}));

describe('Database metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('records pool lifecycle counters and durations', () => {
    const pool = new EventEmitter() as unknown as Pool;
    const client = {} as PoolClient;
    let now = 1_000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    try {
      instrumentDatabasePool(pool, 'reader');

      pool.emit('connect', client);
      now = 2_000;
      pool.emit('acquire', client);
      now = 3_000;
      pool.emit('release', undefined, client);
      now = 5_000;
      pool.emit('remove', client);
      pool.emit('error', new Error('connection failed'), client);

      const metricOptions = {
        attributes: { hostname: os.hostname(), dbInstanceType: 'reader' },
        options: undefined,
      };
      expect(incrementCounterMock.mock.calls).toStrictEqual([
        ['medplum.db.connectionsCreated', metricOptions],
        ['medplum.db.connectionsAcquired', metricOptions],
        ['medplum.db.connectionsRemoved', metricOptions],
        ['medplum.db.connectionErrors', metricOptions],
      ]);
      expect(recordHistogramValueMock.mock.calls).toStrictEqual([
        ['medplum.db.connectionLifetime', 4, { attributes: metricOptions.attributes, options: { unit: 's' } }],
        ['medplum.db.idleBeforeRemoval', 2, { attributes: metricOptions.attributes, options: { unit: 's' } }],
      ]);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  test('records destructive releases without idle time', () => {
    const pool = new EventEmitter() as unknown as Pool;
    const client = {} as PoolClient;
    let now = 1_000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);

    try {
      instrumentDatabasePool(pool, 'writer');
      pool.emit('connect', client);
      now = 2_000;
      pool.emit('release', new Error('discard connection'), client);
      now = 3_000;
      pool.emit('remove', client);

      expect(incrementCounterMock).toHaveBeenCalledWith(
        'medplum.db.connectionsReleasedDestroy',
        expect.objectContaining({ attributes: expect.objectContaining({ dbInstanceType: 'writer' }) })
      );
      expect(recordHistogramValueMock).toHaveBeenCalledWith(
        'medplum.db.connectionLifetime',
        2,
        expect.objectContaining({ options: { unit: 's' } })
      );
      expect(recordHistogramValueMock).not.toHaveBeenCalledWith(
        'medplum.db.idleBeforeRemoval',
        expect.anything(),
        expect.anything()
      );
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  test.each(['committed', 'rolled_back', 'retryable_rollback', 'rollback_failed'] as const)(
    'records %s transaction outcome',
    (outcome) => {
      recordDatabaseTransaction(outcome);

      expect(incrementCounterMock).toHaveBeenCalledWith('medplum.db.transactions', {
        attributes: { hostname: os.hostname(), dbInstanceType: 'writer', outcome },
        options: undefined,
      });
    }
  );
});
