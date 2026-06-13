// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { PoolClient } from 'pg';
import { initAppServices, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { DatabaseMode } from '../../database';
import { getLogger } from '../../logger';
import * as otelModule from '../../otel/otel';
import { getShardSystemRepo } from '../repo';
import { RepositoryConnection } from './repository-connection';
import { TransactionIdleTracker } from './transaction-idle-tracker';

describe('TransactionIdleTracker', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });
  function setIdleInTransactionLogThresholdMs(thresholdMs: number | undefined): () => void {
    const config = getConfig();
    const previousThresholdMs = config.idleInTransactionLogThresholdMs;
    config.idleInTransactionLogThresholdMs = thresholdMs;
    return () => {
      config.idleInTransactionLogThresholdMs = previousThresholdMs;
    };
  }

  test.each([undefined, -1] as (number | undefined)[])(
    'withTransaction does not record transaction idle metrics when threshold is %s',
    async (thresholdMs) => {
      const restoreThreshold = setIdleInTransactionLogThresholdMs(thresholdMs);
      const query = jest.fn(async (_sql: string) => ({ rows: [] }));
      const client = {
        query,
        release: jest.fn(),
      } as unknown as PoolClient;
      const repo = getShardSystemRepo(
        'test-shard',
        RepositoryConnection.borrowClient(client, { mode: DatabaseMode.WRITER })
      );
      const warnSpy = jest.spyOn(getLogger(), 'warn').mockImplementation(() => {});
      const recordHistogramValueSpy = jest.spyOn(otelModule, 'recordHistogramValue').mockImplementation(() => true);

      try {
        await repo.withTransaction(async (txRepo) => {
          const client = txRepo.getDatabaseClient(DatabaseMode.WRITER);
          await client.query('SELECT 1');
        });

        expect(query.mock.calls.map(([sql]) => sql)).toStrictEqual([
          'BEGIN ISOLATION LEVEL REPEATABLE READ',
          'SELECT 1',
          'COMMIT',
        ]);
        expect(client.query).toBe(query);
        expect(warnSpy).not.toHaveBeenCalledWith(TransactionIdleTracker.LOG_HIGH_IDLE_TIME_MSG, expect.anything());
        expect(recordHistogramValueSpy).not.toHaveBeenCalled();
      } finally {
        restoreThreshold();
        warnSpy.mockRestore();
        recordHistogramValueSpy.mockRestore();
      }
    }
  );

  test('withTransaction disables idle tracking for callback-style queries', async () => {
    const restoreThreshold = setIdleInTransactionLogThresholdMs(5);
    let now = 0;
    const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const query = jest.fn((sql: string, callback?: (err: Error | undefined, result: { rows: any[] }) => void) => {
      if (sql === 'SELECT 1' && callback) {
        now += 10;
        callback(undefined, { rows: [] });
        return undefined;
      }
      return Promise.resolve({ rows: [] });
    });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = getShardSystemRepo(
      'test-shard',
      RepositoryConnection.borrowClient(client, { mode: DatabaseMode.WRITER })
    );
    const warnSpy = jest.spyOn(getLogger(), 'warn').mockImplementation(() => {});
    const recordHistogramValueSpy = jest.spyOn(otelModule, 'recordHistogramValue').mockImplementation(() => true);

    try {
      await repo.withTransaction(async (txRepo) => {
        const client = txRepo.getDatabaseClient(DatabaseMode.WRITER);
        await new Promise<void>((resolve, reject) => {
          client.query('SELECT 1', (err) => (err ? reject(err) : resolve()));
        });
      });

      expect(client.query).toBe(query);
      expect(warnSpy).not.toHaveBeenCalledWith(TransactionIdleTracker.LOG_HIGH_IDLE_TIME_MSG, expect.anything());
      expect(recordHistogramValueSpy).not.toHaveBeenCalled();
    } finally {
      restoreThreshold();
      dateNowSpy.mockRestore();
      warnSpy.mockRestore();
      recordHistogramValueSpy.mockRestore();
    }
  });

  test('withTransaction logs and records high idle time in rolled back transaction', async () => {
    const restoreThreshold = setIdleInTransactionLogThresholdMs(0);
    let now = 0;
    const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const query = jest.fn(async (_sql: string) => ({ rows: [] }));
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = getShardSystemRepo(
      'test-shard',
      RepositoryConnection.borrowClient(client, { mode: DatabaseMode.WRITER })
    );
    const warnSpy = jest.spyOn(getLogger(), 'warn').mockImplementation(() => {});
    const recordHistogramValueSpy = jest.spyOn(otelModule, 'recordHistogramValue').mockImplementation(() => true);

    try {
      await expect(
        repo.withTransaction(async () => {
          now += 10;
          throw new Error('work failed');
        })
      ).rejects.toThrow('work failed');

      expect(recordHistogramValueSpy).toHaveBeenCalledWith(TransactionIdleTracker.OTEL_TOTAL_METRIC_NAME, 10, {
        attributes: { attempt: 0, serializable: false, status: 'rolled_back' },
        options: { unit: 'ms' },
      });
      expect(recordHistogramValueSpy).toHaveBeenCalledWith(TransactionIdleTracker.OTEL_MAX_METRIC_NAME, 10, {
        attributes: { attempt: 0, serializable: false, status: 'rolled_back' },
        options: { unit: 'ms' },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        TransactionIdleTracker.LOG_HIGH_IDLE_TIME_MSG,
        expect.objectContaining({
          totalIdleMs: 10,
          maxIdleMs: 10,
          queryCount: 1,
          status: 'rolled_back',
          transactionDurationMs: 10,
        })
      );
    } finally {
      restoreThreshold();
      dateNowSpy.mockRestore();
      warnSpy.mockRestore();
      recordHistogramValueSpy.mockRestore();
    }
  });

  test('withTransaction records outer transaction idle time across nested transactions', async () => {
    const restoreThreshold = setIdleInTransactionLogThresholdMs(50);
    let now = 0;
    const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const query = jest.fn(async (sql: string) => {
      if (sql === 'SELECT 1') {
        now += 25;
      }
      return { rows: [] };
    });
    const client = {
      query,
      release: jest.fn(),
    } as unknown as PoolClient;
    const repo = getShardSystemRepo(
      'test-shard',
      RepositoryConnection.borrowClient(client, { mode: DatabaseMode.WRITER })
    );
    const warnSpy = jest.spyOn(getLogger(), 'warn').mockImplementation(() => {});
    const recordHistogramValueSpy = jest.spyOn(otelModule, 'recordHistogramValue').mockImplementation(() => true);

    try {
      await repo.withTransaction(async (txRepo) => {
        now += 30;
        await txRepo.withTransaction(async (nestedTxRepo) => {
          now += 20;
          const client = nestedTxRepo.getDatabaseClient(DatabaseMode.WRITER);
          await client.query('SELECT 1');
        });
        now += 10;
      });

      expect(recordHistogramValueSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalledWith(TransactionIdleTracker.LOG_HIGH_IDLE_TIME_MSG, expect.anything());

      now = 0;
      query.mockClear();

      await repo.withTransaction(async (txRepo) => {
        now += 20;
        await txRepo.withTransaction(async (nestedTxRepo) => {
          const client = nestedTxRepo.getDatabaseClient(DatabaseMode.WRITER);
          now += 5;
          await client.query('SELECT 1');
        });
        now += 50;
      });

      expect(query.mock.calls.map(([sql]) => sql)).toStrictEqual([
        'BEGIN ISOLATION LEVEL REPEATABLE READ',
        'SAVEPOINT sp2',
        'SELECT 1',
        'RELEASE SAVEPOINT sp2',
        'COMMIT',
      ]);
      expect(recordHistogramValueSpy).toHaveBeenCalledTimes(2);
      expect(recordHistogramValueSpy).toHaveBeenCalledWith(TransactionIdleTracker.OTEL_TOTAL_METRIC_NAME, 75, {
        attributes: { attempt: 0, serializable: false, status: 'committed' },
        options: { unit: 'ms' },
      });
      expect(recordHistogramValueSpy).toHaveBeenCalledWith(TransactionIdleTracker.OTEL_MAX_METRIC_NAME, 50, {
        attributes: { attempt: 0, serializable: false, status: 'committed' },
        options: { unit: 'ms' },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        TransactionIdleTracker.LOG_HIGH_IDLE_TIME_MSG,
        expect.objectContaining({
          attempt: 0,
          totalIdleMs: 75,
          maxIdleMs: 50,
          queryCount: 4,
          queryDurationMs: 25,
          serializable: false,
          status: 'committed',
          thresholdMs: 50,
          transactionAttempts: 2,
          transactionDurationMs: 100,
        })
      );
      expect(client.query).toBe(query);
    } finally {
      restoreThreshold();
      dateNowSpy.mockRestore();
      warnSpy.mockRestore();
      recordHistogramValueSpy.mockRestore();
    }
  });
});
