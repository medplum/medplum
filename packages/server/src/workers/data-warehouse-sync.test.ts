// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Queue } from 'bullmq';
import { Worker } from 'bullmq';
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

jest.mock('../data-warehouse/config', () => {
  const actual: typeof DataWarehouseConfigModule = jest.requireActual('../data-warehouse/config');
  return {
    ...actual,
    getWarehouseSyncPostgresTableNames: jest.fn(() => ['Patient_history', 'Observation_history']),
    resolveWarehouseSourcesFromPostgresTableNames: jest.fn((tableNames: string[]) =>
      tableNames.map((tableName) => ({
        postgresTable: tableName,
        icebergTable: tableName.toLowerCase(),
      }))
    ),
  };
});
jest.mock('../data-warehouse/sync', () => ({
  syncData: jest.fn(async () => ({ resources: [{ action: 'insert' }, { action: 'skip-empty' }] })),
}));
jest.mock('bullmq');

const mockedSyncData = jest.mocked(syncData);
const mockedWorker = jest.mocked(Worker);

function buildConfig(overrides?: Partial<MedplumServerConfig>): MedplumServerConfig {
  return {
    baseUrl: 'http://localhost:8103',
    appBaseUrl: 'http://localhost:3000',
    issuer: 'http://localhost:8103',
    jwksUrl: 'http://localhost:8103/.well-known/jwks.json',
    authorizeUrl: 'http://localhost:8103/oauth2/authorize',
    tokenUrl: 'http://localhost:8103/oauth2/token',
    userInfoUrl: 'http://localhost:8103/oauth2/userinfo',
    introspectUrl: 'http://localhost:8103/oauth2/introspect',
    registerUrl: 'http://localhost:8103/oauth2/register',
    storageBaseUrl: 'http://localhost:8103/storage',
    supportEmail: 'test@example.com',
    maxJsonSize: '1mb',
    maxBatchSize: '50mb',
    awsRegion: 'us-east-1',
    botLambdaRoleArn: 'arn:aws:iam::123456789012:role/test',
    botLambdaLayerName: 'medplum-bot-layer',
    bcryptHashSalt: 10,
    accurateCountThreshold: 1000000,
    defaultBotRuntimeVersion: 'awslambda',
    database: {
      host: 'localhost',
      port: 5432,
      dbname: 'medplum',
      username: 'medplum',
      password: 'medplum',
      queryTimeout: 45000,
    },
    readonlyDatabase: {
      host: 'readonly-db.local',
      port: 5432,
      dbname: 'medplum_ro',
      username: 'medplum_readonly',
      password: 'readonly-secret',
      queryTimeout: 45000,
    },
    redis: {
      host: 'localhost',
      port: 6379,
    },
    bullmq: {
      concurrency: 20,
      removeOnComplete: { count: 1 },
      removeOnFail: { count: 1 },
    },
    dataWarehouse: {
      enabled: true,
      cron: '0 * * * *',
      sink: 's3tables',
      awsS3TableArn: 'arn:aws:s3tables:us-east-1:123456789012:bucket/test',
      namespace: 'default',
    },
    ...overrides,
  } as MedplumServerConfig;
}

describe('data-warehouse sync worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getDataWarehouseSyncOptions uses resolved readonlyDatabase config', () => {
    const config = buildConfig();
    const result = getDataWarehouseSyncOptions(config);

    expect(result.database).toMatchObject({
      host: 'readonly-db.local',
      dbname: 'medplum_ro',
      username: 'medplum_readonly',
      password: 'readonly-secret',
    });
    expect(result.database).not.toBe(config);
    expect(result.sink.type).toStrictEqual('s3tables');
    expect(result.warehouseSources).toHaveLength(2);
  });

  test('getDataWarehouseSyncOptions database is usable by buildPostgresConnectionUriFromMedplumDatabaseConfig', () => {
    const config = buildConfig();
    const result = getDataWarehouseSyncOptions(config);

    const connectionUri = buildPgConnectionURI(result.database);
    const parsed = new URL(connectionUri);
    expect(parsed.protocol).toBe('postgresql:');
    expect(parsed.hostname).toBe('readonly-db.local');
    expect(parsed.pathname).toBe('/medplum_ro');
    expect(parsed.username).toBe('medplum_readonly');
    expect(parsed.password).toBe('readonly-secret');
  });

  test('getDataWarehouseSyncOptions creates local sink', () => {
    const config = buildConfig({
      dataWarehouse: {
        enabled: true,
        cron: '0 * * * *',
        sink: 'local',
        localBasePath: '/tmp/warehouse-out',
      },
    });
    const result = getDataWarehouseSyncOptions(config);
    expect(result.sink.type).toStrictEqual('local');
  });

  test('getDataWarehouseSyncOptions falls back to database when readonlyDatabase is absent', () => {
    const config = buildConfig({
      readonlyDatabase: undefined,
    });
    const result = getDataWarehouseSyncOptions(config);

    expect(result.database).toMatchObject({
      host: 'localhost',
      dbname: 'medplum',
      username: 'medplum',
      password: 'medplum',
    });
  });

  test('getDataWarehouseSyncOptions validates enabled config', () => {
    const config = buildConfig({
      dataWarehouse: {
        enabled: false,
      },
    });

    expect(() => getDataWarehouseSyncOptions(config)).toThrow('dataWarehouse.enabled must be true');
  });

  test('refreshDataWarehouseSyncScheduler upserts scheduler when enabled', async () => {
    const queue = {
      upsertJobScheduler: jest.fn(),
      removeJobScheduler: jest.fn(),
    } as unknown as Queue;

    await refreshDataWarehouseSyncScheduler(buildConfig(), queue);

    expect((queue as any).upsertJobScheduler).toHaveBeenCalledWith(
      DataWarehouseSyncSchedulerId,
      { pattern: '0 * * * *' },
      { data: { trigger: 'scheduler' } }
    );
    expect((queue as any).removeJobScheduler).not.toHaveBeenCalled();
  });

  test('refreshDataWarehouseSyncScheduler removes scheduler when disabled', async () => {
    const queue = {
      upsertJobScheduler: jest.fn(),
      removeJobScheduler: jest.fn(),
    } as unknown as Queue;

    await refreshDataWarehouseSyncScheduler(
      buildConfig({
        dataWarehouse: { enabled: false },
      }),
      queue
    );

    expect((queue as any).removeJobScheduler).toHaveBeenCalledWith(DataWarehouseSyncSchedulerId);
    expect((queue as any).upsertJobScheduler).not.toHaveBeenCalled();
  });

  test('initDataWarehouseSyncWorker defaults concurrency to 1', () => {
    const config = buildConfig();
    initDataWarehouseSyncWorker(config, { workerEnabled: true });

    expect(mockedWorker).toHaveBeenCalled();
    const lastCall = mockedWorker.mock.calls[mockedWorker.mock.calls.length - 1];
    expect(lastCall[0]).toStrictEqual(DataWarehouseSyncQueueName);
    expect(lastCall[2]).toMatchObject({ concurrency: 1 });
  });

  test('processDataWarehouseSyncJob calls syncData with resolved database config', async () => {
    const config = buildConfig();
    await processDataWarehouseSyncJob(config, { data: { trigger: 'scheduler' } } as any);

    expect(mockedSyncData).toHaveBeenCalledTimes(1);
    const callArg = mockedSyncData.mock.calls[0][0];
    expect(callArg?.database).toMatchObject({
      host: 'readonly-db.local',
      dbname: 'medplum_ro',
    });
    expect(callArg?.database).not.toBe(config);
    expect(callArg).toMatchObject({
      sink: { type: 's3tables' },
    });
    expect(typeof callArg?.onProgress).toStrictEqual('function');
  });
});
