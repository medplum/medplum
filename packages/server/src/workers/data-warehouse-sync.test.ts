// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Queue } from 'bullmq';
import { Queue as BullmqQueue, Worker } from 'bullmq';
import { loadTestConfig } from '../config/loader';
import type { MedplumServerConfig } from '../config/types';
import type * as DataWarehouseConfigModule from '../data-warehouse/config';
import { buildPgConnectionURI } from '../data-warehouse/config';
import { syncData } from '../data-warehouse/sync';
import {
  DataWarehouseSyncQueueName,
  DataWarehouseSyncSchedulerId,
  getDataWarehouseSyncOptions,
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
  syncData: jest.fn(async () => ({ resources: [{ action: 'insert' }, { action: 'skip-empty' }] })),
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

    test('getDataWarehouseSyncOptions validates enabled config', () => {
      expect(() => getDataWarehouseSyncOptions(config)).toThrow('dataWarehouse.enabled must be true');
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

  test('initDataWarehouseSyncWorker defaults concurrency to 1', () => {
    initDataWarehouseSyncWorker(config, { workerEnabled: true });

    expect(mockedQueue).toHaveBeenCalled();
    expect(mockedWorker).toHaveBeenCalled();
    const lastCall = mockedWorker.mock.calls[mockedWorker.mock.calls.length - 1];
    expect(lastCall[0]).toStrictEqual(DataWarehouseSyncQueueName);
    expect(lastCall[2]).toMatchObject({ concurrency: 1 });
  });

  test('processDataWarehouseSyncJob calls syncData with resolved database config', async () => {
    await processDataWarehouseSyncJob(config, { id: 'job-1', data: { trigger: 'scheduler' } } as any);

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
});
