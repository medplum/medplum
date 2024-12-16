import { deepClone, getReferenceString, stripEmpty } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Job, Queue } from 'bullmq';
import { Pool, PoolConfig } from 'pg';
import { initAppServices, shutdownApp } from './app';
import { loadTestConfig, MedplumServerConfig } from './config';
import { DATA_MIGRATION_JOB_KEY, markPendingDataMigrationCompleted, maybeStartDataMigration } from './database';
import { getSystemRepo, Repository } from './fhir/repo';
import { getRedis } from './redis';
import { waitFor, withTestContext } from './test.setup';
import { AsyncJobPollerJobData, execAsyncJobPollerJob, getAsyncJobPollerQueue } from './workers/asyncjobpoller';

jest.mock('./migrations/data/v1', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AsyncJobExecutor } = require('./fhir/operations/utils/asyncjobexecutor');
  return {
    run: async function run(repo: Repository) {
      const exec = new AsyncJobExecutor(repo);
      const job = await exec.init('data-migration-v1');
      await exec.run(async () => {
        async function runMigration(): Promise<void> {
          const exec = new AsyncJobExecutor(repo, job);
          await exec.completeJob(repo);
        }
        runMigration().catch(console.error);
      });
      return job;
    },
  };
});

describe('Database migrations', () => {
  let originalDataVersion: number;
  let migrationsConfig: MedplumServerConfig;
  let noMigrationsConfig: MedplumServerConfig;
  let poolConfig: PoolConfig;
  let outOfBandPool: Pool;

  beforeAll(async () => {
    noMigrationsConfig = await loadTestConfig();
    migrationsConfig = deepClone(noMigrationsConfig);
    migrationsConfig.database.runMigrations = true;

    poolConfig = {
      host: noMigrationsConfig.database.host,
      port: noMigrationsConfig.database.port,
      database: noMigrationsConfig.database.dbname,
      user: noMigrationsConfig.database.username,
      password: noMigrationsConfig.database.password,
      application_name: 'medplum-server',
      ssl: noMigrationsConfig.database.ssl,
      max: noMigrationsConfig.database.maxConnections ?? 100,
    };

    outOfBandPool = new Pool(poolConfig);
    const results = await outOfBandPool.query<{ dataVersion: number }>(
      'SELECT "dataVersion" FROM "DatabaseMigration";'
    );
    // We store the original version before our edits for this test suite
    originalDataVersion = results.rows[0].dataVersion ?? -1;
  });

  afterAll(async () => {
    // We unset our version changes
    await outOfBandPool.query('UPDATE "DatabaseMigration" SET "dataVersion"=$1;', [originalDataVersion]);
    await outOfBandPool.end();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    // We set the dataVersion to 0 so that we can trigger the 'v1' migration to be pending after schema migrations run
    await outOfBandPool.query('UPDATE "DatabaseMigration" SET "dataVersion" = 0;');
    await withTestContext(() => initAppServices(migrationsConfig));
    await getRedis().del(DATA_MIGRATION_JOB_KEY);
  });

  afterEach(async () => {
    await shutdownApp();
  });

  test('No data migration in progress -- start migration job', () =>
    withTestContext(async () => {
      const asyncJob = await maybeStartDataMigration();
      expect(asyncJob).toMatchObject<AsyncJob>({
        id: expect.any(String),
        resourceType: 'AsyncJob',
        status: 'accepted',
        request: expect.any(String),
        requestTime: expect.any(String),
      });

      const pollerQueue = jest.mocked(getAsyncJobPollerQueue() as Queue<AsyncJobPollerJobData>);
      await waitFor(async () => {
        expect(pollerQueue.add).toHaveBeenCalledWith(
          'AsyncJobPollerJob',
          expect.objectContaining<Partial<AsyncJobPollerJobData>>({
            ownJob: asyncJob,
            trackedJob: expect.objectContaining({ resourceType: 'AsyncJob' }),
            jobType: 'dataMigration',
            jobData: expect.any(Object),
          }),
          { delay: 1000 }
        );

        const pollerJob = { id: 1, data: pollerQueue.add.mock.lastCall?.[1] } as unknown as Job;
        pollerQueue.add.mockClear();

        await execAsyncJobPollerJob(pollerJob);

        const updated = await getSystemRepo().readResource('AsyncJob', (asyncJob as AsyncJob).id as string);

        expect(updated).toMatchObject<Partial<AsyncJob>>({
          resourceType: 'AsyncJob',
          status: 'completed',
        });
      });
    }));

  test('No pending data migration', async () => {
    markPendingDataMigrationCompleted();
    await expect(maybeStartDataMigration()).resolves.toBeUndefined();
  });

  test('Data migration already in progress', async () => {
    const asyncJob = await getSystemRepo().createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      requestTime: new Date().toISOString(),
      request: 'mock-job',
    });

    await getRedis().set(DATA_MIGRATION_JOB_KEY, getReferenceString(asyncJob));
    await expect(maybeStartDataMigration()).resolves.toMatchObject(stripEmpty(asyncJob));
    await getRedis().del(DATA_MIGRATION_JOB_KEY);
  });
});
