// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit tests for `data-warehouse-sync.ts` (BullMQ worker wiring only).
 *
 * Covers config resolution (`getDataWarehouseSyncOptions`), scheduler upsert/remove,
 * worker initialization, and `processDataWarehouseSyncJob` delegating to `syncData` with
 * `onProgress` → `job.updateProgress`. Does not run the sync pipeline: `syncData` and BullMQ
 * are mocked (`src/__mocks__/bullmq.ts`). Redis is real where `initWorkers` is exercised
 * (via `initAppServices`), matching other worker tests.
 *
 * For Postgres → Parquet export behavior, see `data-warehouse/sync.int.test.ts`.
 * For the worker job path with a real database and sync, see `data-warehouse-sync.int.test.ts`.
 */

import type { Queue } from 'bullmq';
import { Queue as BullmqQueue, Worker } from 'bullmq';
import type { PoolClient } from 'pg';
import { closeWorkers, initWorkers } from '.';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import type * as DataWarehouseConfigModule from '../data-warehouse/config';
import { buildPgConnectionURI } from '../data-warehouse/config';
import { syncData } from '../data-warehouse/sync';
import * as database from '../database';
import { locks } from '../database';
import {
  DATA_WAREHOUSE_SYNC_LOCK_DURATION_MS,
  DataWarehouseSyncQueueName,
  DataWarehouseSyncSchedulerId,
  getDataWarehouseSyncOptions,
  getDataWarehouseSyncQueue,
  initDataWarehouseSyncWorker,
  processDataWarehouseSyncJob,
  refreshDataWarehouseSyncScheduler,
} from './data-warehouse-sync';

const TABLE_NAMES = ['Patient_history', 'Observation_history'];

jest.mock('../data-warehouse/config', () => {
  const actual: typeof DataWarehouseConfigModule = jest.requireActual('../data-warehouse/config');
  return {
    ...actual,
    getWarehouseSyncPostgresTableNames: jest.fn(() => TABLE_NAMES),
  };
});
jest.mock('../data-warehouse/sync', () => ({
  syncData: jest.fn(async () => ({
    resources: [
      { icebergTable: 'patient_history', table: 'patient_history.parquet', count: 1 },
      { icebergTable: 'observation_history', table: 'observation_history.parquet', count: 0 },
    ],
  })),
}));
jest.mock('bullmq');

const mockedSyncData = jest.mocked(syncData);
const mockedQueue = jest.mocked(BullmqQueue);
const mockedWorker = jest.mocked(Worker);

const enabledDataWarehouse: NonNullable<MedplumServerConfig['dataWarehouse']> = {
  enabled: true,
  cron: '0 * * * *',
  destination: 's3tables',
  awsS3TableArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test',
  namespace: 'default',
};

describe('data-warehouse sync worker', () => {
  let config: MedplumServerConfig;

  async function initConfig(overrides?: Partial<MedplumServerConfig>): Promise<void> {
    const base = await loadTestConfig();
    config = {
      ...base,
      ...overrides,
      dataWarehouse: {
        ...enabledDataWarehouse,
        ...overrides?.dataWarehouse,
      },
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    await initConfig();
  });

  test('getDataWarehouseSyncOptions passes startDate when configured', async () => {
    await initConfig({
      dataWarehouse: {
        ...enabledDataWarehouse,
        startDate: '2024-01-01T00:00:00.000Z',
      },
    });
    const result = getDataWarehouseSyncOptions(config);
    expect(result.startDate).toBe('2024-01-01T00:00:00.000Z');
  });

  test('getDataWarehouseSyncOptions uses resolved readonlyDatabase config', () => {
    const result = getDataWarehouseSyncOptions(config);

    expect(result.database).toMatchObject({
      host: config.readonlyDatabase?.host,
      dbname: config.readonlyDatabase?.dbname,
      username: 'medplum_test_readonly',
      password: 'medplum_test_readonly',
    });
    expect(result.database).not.toBe(config);
    expect(result.destination.type).toStrictEqual('s3tables');
    expect(result.warehouseSources).toHaveLength(2);
  });

  test('getDataWarehouseSyncOptions database is usable by buildPostgresConnectionUriFromMedplumDatabaseConfig', () => {
    const result = getDataWarehouseSyncOptions(config);

    const connectionUri = buildPgConnectionURI(result.database);
    const parsed = new URL(connectionUri);
    expect(parsed.protocol).toBe('postgresql:');
    expect(parsed.hostname).toBe(config.readonlyDatabase?.host);
    expect(parsed.pathname).toBe(`/${config.readonlyDatabase?.dbname}`);
    expect(parsed.username).toBe('medplum_test_readonly');
    expect(parsed.password).toBe('medplum_test_readonly');
  });

  describe('with local destination', () => {
    beforeEach(async () => {
      await initConfig({
        dataWarehouse: {
          enabled: true,
          cron: '0 * * * *',
          destination: 'local',
          localBasePath: '/tmp/warehouse-out',
        },
      });
    });

    test('getDataWarehouseSyncOptions creates local destination', () => {
      const result = getDataWarehouseSyncOptions(config);
      expect(result.destination.type).toStrictEqual('local');
    });
  });

  describe('without readonlyDatabase', () => {
    beforeEach(async () => {
      await initConfig({ readonlyDatabase: undefined });
    });

    test('getDataWarehouseSyncOptions falls back to database when readonlyDatabase is absent', () => {
      const result = getDataWarehouseSyncOptions(config);

      expect(result.database).toMatchObject({
        host: config.database.host,
        dbname: config.database.dbname,
        username: config.database.username,
        password: config.database.password,
      });
    });
  });

  describe('with data warehouse disabled', () => {
    beforeEach(async () => {
      await initConfig({
        dataWarehouse: {
          enabled: false,
        },
      });
    });

    test('getDataWarehouseSyncOptions throws when sync is disabled', () => {
      expect(() => getDataWarehouseSyncOptions(config)).toThrow('dataWarehouse.enabled must be true');
    });

    test('initDataWarehouseSyncWorker skips queue and worker when sync is disabled', () => {
      const result = initDataWarehouseSyncWorker(config, { workerEnabled: true });

      expect(result.queue).toBeUndefined();
      expect(result.worker).toBeUndefined();
      expect(mockedQueue).not.toHaveBeenCalled();
      expect(mockedWorker).not.toHaveBeenCalled();
    });

    test('refreshDataWarehouseSyncScheduler removes scheduler when disabled', async () => {
      const queue = {
        upsertJobScheduler: jest.fn(),
        removeJobScheduler: jest.fn(),
      } as unknown as Queue;

      await refreshDataWarehouseSyncScheduler(config, queue);

      expect((queue as any).removeJobScheduler).toHaveBeenCalledWith(DataWarehouseSyncSchedulerId);
      expect((queue as any).upsertJobScheduler).not.toHaveBeenCalled();
    });
  });

  test('refreshDataWarehouseSyncScheduler upserts scheduler when enabled', async () => {
    const queue = {
      upsertJobScheduler: jest.fn(),
      removeJobScheduler: jest.fn(),
    } as unknown as Queue;

    await refreshDataWarehouseSyncScheduler(config, queue);

    expect((queue as any).upsertJobScheduler).toHaveBeenCalledWith(
      DataWarehouseSyncSchedulerId,
      { pattern: '0 * * * *' },
      { data: { trigger: 'scheduler' } }
    );
    expect((queue as any).removeJobScheduler).not.toHaveBeenCalled();
  });

  test('initDataWarehouseSyncWorker skips queue and worker when disabled', () => {
    const result = initDataWarehouseSyncWorker(config, { workerEnabled: false });

    expect(result.queue).toBeUndefined();
    expect(result.worker).toBeUndefined();
    expect(mockedQueue).not.toHaveBeenCalled();
    expect(mockedWorker).not.toHaveBeenCalled();
  });

  describe('with invalid enabled configuration', () => {
    beforeEach(async () => {
      const base = await loadTestConfig();
      config = {
        ...base,
        dataWarehouse: {
          enabled: true,
          cron: '0 * * * *',
          destination: 's3tables',
        },
      };
    });

    test('getDataWarehouseSyncOptions throws configuration errors', () => {
      expect(() => getDataWarehouseSyncOptions(config)).toThrow(
        'dataWarehouse.awsS3TableArn is required when dataWarehouse.destination is "s3tables"'
      );
    });

    test('initDataWarehouseSyncWorker skips queue and worker', () => {
      const result = initDataWarehouseSyncWorker(config, { workerEnabled: true });

      expect(result.queue).toBeUndefined();
      expect(result.worker).toBeUndefined();
      expect(mockedQueue).not.toHaveBeenCalled();
      expect(mockedWorker).not.toHaveBeenCalled();
    });

    test('refreshDataWarehouseSyncScheduler removes scheduler and does not upsert', async () => {
      const queue = {
        upsertJobScheduler: jest.fn(),
        removeJobScheduler: jest.fn(),
      } as unknown as Queue;

      await refreshDataWarehouseSyncScheduler(config, queue);

      expect((queue as any).removeJobScheduler).toHaveBeenCalledWith(DataWarehouseSyncSchedulerId);
      expect((queue as any).upsertJobScheduler).not.toHaveBeenCalled();
    });
  });

  test('initDataWarehouseSyncWorker defaults concurrency to 1 and lockDuration to 5 minutes', () => {
    initDataWarehouseSyncWorker(config, { workerEnabled: true });

    expect(mockedQueue).toHaveBeenCalled();
    expect(mockedWorker).toHaveBeenCalled();
    const lastCall = mockedWorker.mock.calls[mockedWorker.mock.calls.length - 1];
    expect(lastCall[0]).toStrictEqual(DataWarehouseSyncQueueName);
    expect(lastCall[2]).toMatchObject({
      concurrency: 1,
      lockDuration: DATA_WAREHOUSE_SYNC_LOCK_DURATION_MS,
    });
  });

  describe('processDataWarehouseSyncJob', () => {
    beforeEach(() => {
      jest.spyOn(database, 'getDatabasePool').mockReturnValue({} as ReturnType<typeof database.getDatabasePool>);
      jest.spyOn(database, 'withPoolClient').mockImplementation(async (callback) => callback({} as PoolClient));
      jest.spyOn(database, 'acquireAdvisoryLock').mockResolvedValue(true);
      jest.spyOn(database, 'releaseAdvisoryLock').mockResolvedValue(undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('acquires and releases data warehouse sync advisory lock', async () => {
      const updateProgress = jest.fn().mockResolvedValue(undefined);
      await processDataWarehouseSyncJob(config, {
        id: 'job-1',
        data: { trigger: 'scheduler' },
        updateProgress,
      } as any);

      expect(database.withPoolClient).toHaveBeenCalledTimes(1);
      expect(database.acquireAdvisoryLock).toHaveBeenCalledWith(expect.anything(), locks.dataWarehouseSync, {
        maxAttempts: 1,
      });
      expect(database.releaseAdvisoryLock).toHaveBeenCalledWith(expect.anything(), locks.dataWarehouseSync);
    });

    test('skips sync when advisory lock is not available', async () => {
      jest.spyOn(database, 'acquireAdvisoryLock').mockResolvedValueOnce(false);

      await processDataWarehouseSyncJob(config, {
        id: 'job-1',
        data: { trigger: 'scheduler' },
        updateProgress: jest.fn(),
      } as any);

      expect(mockedSyncData).not.toHaveBeenCalled();
      expect(database.releaseAdvisoryLock).not.toHaveBeenCalled();
    });

    test('calls syncData with resolved database config', async () => {
      const updateProgress = jest.fn().mockResolvedValue(undefined);
      await processDataWarehouseSyncJob(config, {
        id: 'job-1',
        data: { trigger: 'scheduler' },
        updateProgress,
      } as any);

      expect(mockedSyncData).toHaveBeenCalledTimes(1);
      const callArg = mockedSyncData.mock.calls[0][0];
      expect(callArg?.database).toMatchObject({
        host: config.readonlyDatabase?.host,
        dbname: config.readonlyDatabase?.dbname,
      });
      expect(callArg?.database).not.toBe(config);
      expect(callArg).toMatchObject({
        destination: { type: 's3tables' },
      });
      expect(typeof callArg?.onProgress).toStrictEqual('function');
    });

    test('forwards syncData onProgress to job.updateProgress', async () => {
      const updateProgress = jest.fn().mockResolvedValue(undefined);
      mockedSyncData.mockImplementationOnce(async (options) => {
        await options?.onProgress?.('Syncing Patient_history: 1 row(s)', {
          table: 'patient_history',
          icebergTable: 'patient_history',
          count: 1,
        });
        return { resources: [] };
      });

      await processDataWarehouseSyncJob(config, {
        id: 'job-1',
        data: { trigger: 'scheduler' },
        updateProgress,
      } as any);

      expect(updateProgress).toHaveBeenCalledWith({
        message: 'Syncing Patient_history: 1 row(s)',
        table: 'patient_history',
        icebergTable: 'patient_history',
        count: 1,
      });
    });
  });

  describe('initWorkers', () => {
    let appConfig: MedplumServerConfig;

    beforeAll(async () => {
      appConfig = await loadTestConfig();
      await initAppServices(appConfig);
      await closeWorkers();
    });

    afterEach(async () => {
      await closeWorkers();
    });

    afterAll(async () => {
      await shutdownApp();
    });

    test('registers DataWarehouseSyncQueue when sync is operational', async () => {
      initWorkers({
        ...appConfig,
        workers: { enabled: ['data-warehouse-sync'] },
        dataWarehouse: {
          enabled: true,
          cron: '0 * * * *',
          destination: 'local',
          localBasePath: '/tmp/medplum-dw-worker-test',
        },
      });

      expect(getDataWarehouseSyncQueue()).toBeDefined();
      expect(getDataWarehouseSyncQueue()).toBeInstanceOf(BullmqQueue);
    });

    test('does not register queue when data warehouse config is invalid', async () => {
      initWorkers({
        ...appConfig,
        workers: { enabled: ['data-warehouse-sync'] },
        dataWarehouse: {
          enabled: true,
          cron: '0 * * * *',
          destination: 'local',
        },
      });

      expect(getDataWarehouseSyncQueue()).toBeUndefined();
    });
  });
});
