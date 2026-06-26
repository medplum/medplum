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
import { Worker } from 'bullmq';
import type { PoolClient } from 'pg';
import type { MockInstance } from 'vitest';
import { vi } from 'vitest';
import { closeWorkers, initWorkers } from '.';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import * as validateConfig from '../config/validate-config';
import * as dataWarehouseConfig from '../data-warehouse/config';
import { buildPgConnectionURI } from '../data-warehouse/config';
import * as syncModule from '../data-warehouse/sync';
import * as database from '../database';
import { locks } from '../database';
import {
  DataWarehouseSyncQueueName,
  DataWarehouseSyncSchedulerId,
  getDataWarehouseSyncOptions,
  getDataWarehouseSyncQueue,
  initDataWarehouseSyncWorker,
  processDataWarehouseSyncJob,
  refreshDataWarehouseSyncScheduler,
} from './data-warehouse-sync';

const TABLE_NAMES = ['Patient_History', 'Observation_History', 'Account_History', 'Encounter_History'];
const FILTERED_HISTORY_TABLES = ['Patient_History', 'Observation_History'];

function setupWarehouseTableNamesMock(): void {
  vi.spyOn(dataWarehouseConfig, 'getWarehouseSyncPostgresTableNames').mockImplementation(
    (includeResourceTypes?: string[], _excludeResourceTypes?: string[]) => {
      if (!includeResourceTypes?.length) {
        return TABLE_NAMES;
      }
      const selected = new Set(includeResourceTypes);
      return FILTERED_HISTORY_TABLES.filter((tableName) => selected.has(tableName.replace(/_History$/, '')));
    }
  );
}

function setupSyncDataMock(): MockInstance<typeof syncModule.syncData> {
  return vi.spyOn(syncModule, 'syncData').mockResolvedValue({
    tables: [
      {
        icebergTable: 'patient_history',
        postgresTable: 'Patient_History',
        destination: 'patient_history.parquet',
        rowsInserted: 1,
        watermarkDurationMs: 0,
        syncDurationMs: 0,
      },
      {
        icebergTable: 'observation_history',
        postgresTable: 'Observation_History',
        destination: 'observation_history.parquet',
        rowsInserted: 0,
        watermarkDurationMs: 0,
        syncDurationMs: 0,
      },
    ],
  });
}
const mockedWorker = vi.mocked(Worker);

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
    vi.restoreAllMocks();
    setupWarehouseTableNamesMock();
    setupSyncDataMock();
    await initConfig();
  });

  test('getDataWarehouseSyncOptions passes includeResourceTypes and filters warehouse sources', async () => {
    vi.spyOn(validateConfig, 'getDataWarehouseConfigErrors').mockReturnValue([]);

    await initConfig({
      dataWarehouse: {
        ...enabledDataWarehouse,
        includeResourceTypes: ['Patient'],
      },
    });
    const result = getDataWarehouseSyncOptions(config);

    expect(result.includeResourceTypes).toStrictEqual(['Patient']);
    expect(dataWarehouseConfig.getWarehouseSyncPostgresTableNames).toHaveBeenCalledWith(['Patient'], undefined);
    expect(result.warehouseSources).toHaveLength(1);
    expect(result.warehouseSources[0]).toMatchObject({
      postgresTable: 'Patient_History',
      icebergTable: 'patient_history',
    });

    vi.restoreAllMocks();
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
    expect(result.warehouseSources).toHaveLength(TABLE_NAMES.length);
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
      expect(mockedWorker).not.toHaveBeenCalled();
    });

    test('refreshDataWarehouseSyncScheduler removes scheduler when disabled', async () => {
      const queue = {
        upsertJobScheduler: vi.fn(),
        removeJobScheduler: vi.fn(),
      } as unknown as Queue;

      await refreshDataWarehouseSyncScheduler(config, queue);

      expect((queue as any).removeJobScheduler).toHaveBeenCalledWith(DataWarehouseSyncSchedulerId);
      expect((queue as any).upsertJobScheduler).not.toHaveBeenCalled();
    });
  });

  test('refreshDataWarehouseSyncScheduler upserts scheduler when enabled', async () => {
    const queue = {
      upsertJobScheduler: vi.fn(),
      removeJobScheduler: vi.fn(),
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
      expect(mockedWorker).not.toHaveBeenCalled();
    });

    test('refreshDataWarehouseSyncScheduler removes scheduler and does not upsert', async () => {
      const queue = {
        upsertJobScheduler: vi.fn(),
        removeJobScheduler: vi.fn(),
      } as unknown as Queue;

      await refreshDataWarehouseSyncScheduler(config, queue);

      expect((queue as any).removeJobScheduler).toHaveBeenCalledWith(DataWarehouseSyncSchedulerId);
      expect((queue as any).upsertJobScheduler).not.toHaveBeenCalled();
    });
  });

  test('initDataWarehouseSyncWorker creates queue and worker when enabled', () => {
    const result = initDataWarehouseSyncWorker(config, { workerEnabled: true });

    expect(result.name).toStrictEqual(DataWarehouseSyncQueueName);
    expect(result.queue).toBeDefined();
    expect(result.worker).toBeDefined();
  });

  describe('processDataWarehouseSyncJob', () => {
    beforeEach(() => {
      vi.spyOn(database, 'getDatabasePool').mockReturnValue({} as ReturnType<typeof database.getDatabasePool>);
      vi.spyOn(database, 'withPoolClient').mockImplementation(async (callback) => callback({} as PoolClient));
      vi.spyOn(database, 'acquireAdvisoryLock').mockResolvedValue(true);
      vi.spyOn(database, 'releaseAdvisoryLock').mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('acquires and releases data warehouse sync advisory lock', async () => {
      const updateProgress = vi.fn().mockResolvedValue(undefined);
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
      vi.spyOn(database, 'acquireAdvisoryLock').mockResolvedValueOnce(false);

      await processDataWarehouseSyncJob(config, {
        id: 'job-1',
        data: { trigger: 'scheduler' },
        updateProgress: vi.fn(),
      } as any);

      expect(syncModule.syncData).not.toHaveBeenCalled();
      expect(database.releaseAdvisoryLock).not.toHaveBeenCalled();
    });

    test('calls syncData with resolved database config', async () => {
      const updateProgress = vi.fn().mockResolvedValue(undefined);
      await processDataWarehouseSyncJob(config, {
        id: 'job-1',
        data: { trigger: 'scheduler' },
        updateProgress,
      } as any);

      expect(syncModule.syncData).toHaveBeenCalledTimes(1);
      const callArg = vi.mocked(syncModule.syncData).mock.calls[0][0];
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
      const updateProgress = vi.fn().mockResolvedValue(undefined);
      vi.mocked(syncModule.syncData).mockImplementationOnce(async (options) => {
        await options?.onProgress?.('Completed patient_history (1 rows, table 1/1)', {
          tablesCompleted: 1,
          tablesTotal: 1,
          icebergTable: 'patient_history',
          postgresTable: 'Patient_History',
          destination: 'patient_history',
          rowsInserted: 1,
        });
        return { tables: [] };
      });

      await processDataWarehouseSyncJob(config, {
        id: 'job-1',
        data: { trigger: 'scheduler' },
        updateProgress,
      } as any);

      expect(updateProgress).toHaveBeenCalledWith({
        tablesCompleted: 1,
        tablesTotal: 1,
        icebergTable: 'patient_history',
        postgresTable: 'Patient_History',
        destination: 'patient_history',
        rowsInserted: 1,
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
