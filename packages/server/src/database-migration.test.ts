import { deepClone, parseSearchRequest, sleep, WithId } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Pool, PoolConfig } from 'pg';
import { initAppServices, shutdownApp } from './app';
import * as configLoaderModule from './config/loader';
import { loadTestConfig } from './config/loader';
import { MedplumServerConfig } from './config/types';
import {
  getPendingPostDeployMigration,
  markPendingDataMigrationCompleted,
  maybeStartPostDeployMigration,
} from './database';
import { getSystemRepo, Repository } from './fhir/repo';
import { globalLogger } from './logger';
import { createTestProject, withTestContext } from './test.setup';
import * as versionModule from './util/version';
import { ReindexPostDeployMigration } from './migrations/data/types';

const MAX_POLL_TRIES = 5;

jest.mock('./migrations/data/v1', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AsyncJobExecutor } = require('./fhir/operations/utils/asyncjobexecutor');
  const migration: ReindexPostDeployMigration = {
    type: 'reindex',
    run: async (repo: Repository, asyncJob: AsyncJob): Promise<void> => {
      const exec = new AsyncJobExecutor(repo, asyncJob);
      await exec.run(async (asyncJob: AsyncJob) => {
        async function runMigration(): Promise<void> {
          const exec = new AsyncJobExecutor(repo, asyncJob);
          await exec.completeJob(repo);
        }
        runMigration().catch(console.error);
      });
    },
  };

  return { migration };
});

jest.mock('./migrations/data/index', () => {
  return {
    v1: jest.requireMock('./migrations/data/v1'),
  };
});

jest.mock('./util/version', () => {
  return { getServerVersion: jest.fn().mockImplementation(() => '3.3.0') };
});

describe('Database migrations', () => {
  let originalDataVersion: number;
  let migrationsConfig: MedplumServerConfig;
  let noMigrationsConfig: MedplumServerConfig;
  let poolConfig: PoolConfig;
  let outOfBandPool: Pool;

  beforeAll(async () => {
    console.log = jest.fn();

    noMigrationsConfig = await loadTestConfig();
    migrationsConfig = deepClone(noMigrationsConfig);
    migrationsConfig.database.runMigrations = true;
    // We want to control when post deploy migrations are run
    migrationsConfig.database.disableRunPostDeployMigrations = true;

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

  beforeEach(async () => {
    jest.restoreAllMocks();
    // We set the dataVersion to 1 so that we can trigger the 'v1' migration to be pending after schema migrations run
    await outOfBandPool.query('UPDATE "DatabaseMigration" SET "dataVersion" = 0;');
  });

  afterAll(async () => {
    // We unset our version changes
    await outOfBandPool.query('UPDATE "DatabaseMigration" SET "dataVersion"=$1;', [originalDataVersion]);
    await outOfBandPool.end();
  });

  describe('Database startup check', () => {
    afterEach(async () => {
      await shutdownApp();
    });

    test('Current version is greater than `requiredBefore`', () =>
      withTestContext(async () => {
        jest.spyOn(versionModule, 'getServerVersion').mockImplementation(() => '4.0.0');
        await expect(initAppServices(migrationsConfig)).rejects.toThrow(
          new Error(
            'Unable to run this version of Medplum server. Pending post-deploy migration v1 requires server at version 3.3.0 <= version < 4.0.0, but current server version is 4.0.0'
          )
        );
        await shutdownApp();
      }));

    test('Current version is less than required version', async () => {
      const loggerInfoSpy = jest.spyOn(globalLogger, 'info');

      jest.spyOn(versionModule, 'getServerVersion').mockImplementation(() => '3.2.0');
      await expect(initAppServices(migrationsConfig)).resolves.toBeUndefined();
      expect(loggerInfoSpy).not.toHaveBeenCalledWith('Data migration ready to run', {
        dataVersion: expect.any(Number),
      });

      await shutdownApp();
      loggerInfoSpy.mockRestore();
    });

    test.each(['3.3.0', '3.3.1', '3.4.0'])(
      'Current version greater than or equal to required version and less than `requiredBefore` -- version %s',
      (serverVersion) =>
        withTestContext(async () => {
          const loggerInfoSpy = jest.spyOn(globalLogger, 'info');

          jest.spyOn(versionModule, 'getServerVersion').mockImplementation(() => serverVersion);
          jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('Process exited with exit code 1');
          });

          await expect(initAppServices(migrationsConfig)).resolves.toBeUndefined();
          expect(loggerInfoSpy).toHaveBeenCalledWith('Data migration ready to run', { dataVersion: 1 });

          await shutdownApp();
          loggerInfoSpy.mockRestore();
        })
    );
  });

  describe("maybeStartDataMigrations -- Schema migrations didn't run", () => {
    beforeEach(async () => {
      await initAppServices(noMigrationsConfig);

      // Delete all data migration jobs
      const systemRepo = getSystemRepo();
      const jobs = await systemRepo.searchResources<AsyncJob>(parseSearchRequest('AsyncJob?type=data-migration'));
      if (jobs.length) {
        await systemRepo.expungeResources(
          'AsyncJob',
          jobs.map((job) => job.id)
        );
      }
    });

    afterEach(async () => {
      await shutdownApp();
    });

    test('Schema migrations did not run', () =>
      withTestContext(async () => {
        await expect(maybeStartPostDeployMigration()).rejects.toThrow(
          'Cannot run post-deploy migration since pre-deploy migrations did not run'
        );
      }));
  });

  describe('maybeStartDataMigration -- Schema migrations ran', () => {
    let getConfigSpy: jest.SpyInstance;

    beforeEach(async () => {
      getConfigSpy = jest.spyOn(configLoaderModule, 'getConfig').mockImplementation(() => {
        return migrationsConfig;
      });

      await initAppServices(migrationsConfig);

      // Delete all data migration jobs
      const systemRepo = getSystemRepo();
      const jobs = await systemRepo.searchResources<AsyncJob>(parseSearchRequest('AsyncJob?type=data-migration'));
      for (const job of jobs) {
        await systemRepo.deleteResource('AsyncJob', job.id);
      }
    });

    afterEach(async () => {
      await shutdownApp();
      getConfigSpy.mockRestore();
    });

    async function waitForCompleted(asyncJobId: string): Promise<WithId<AsyncJob> | undefined> {
      let updated: WithId<AsyncJob> | undefined;
      let tries = 0;
      while (updated?.status !== 'completed') {
        if (tries > MAX_POLL_TRIES) {
          throw new Error('Timed out while polling async job');
        }
        updated = await getSystemRepo().readResource<AsyncJob>('AsyncJob', asyncJobId);
        tries += 1;
        await sleep(100);
      }
      return updated;
    }

    test('No data migration in progress -- start migration job', () =>
      withTestContext(async () => {
        jest.spyOn(versionModule, 'getServerVersion').mockImplementation(() => '3.3.0');

        const asyncJob = await maybeStartPostDeployMigration();
        if (!asyncJob) {
          throw new Error('Expected to start post-deploy migration');
        }

        expect(asyncJob).toMatchObject<AsyncJob>({
          id: expect.any(String),
          type: 'data-migration',
          resourceType: 'AsyncJob',
          status: 'accepted',
          request: expect.any(String),
          requestTime: expect.any(String),
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        const updated = await waitForCompleted(asyncJob.id);
        expect(updated).toMatchObject<Partial<AsyncJob>>({
          resourceType: 'AsyncJob',
          status: 'completed',
        });
      }));

    test('No pending data migration', () =>
      withTestContext(async () => {
        await markPendingDataMigrationCompleted({
          resourceType: 'AsyncJob',
          type: 'data-migration',
          status: 'accepted',
          request: 'mock-data-job',
          requestTime: new Date().toISOString(),
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });
        await expect(maybeStartPostDeployMigration()).resolves.toBeUndefined();
      }));

    test('Existing AsyncJob that gets requeued and completes', () =>
      withTestContext(async () => {
        const asyncJob = await getSystemRepo().createResource<AsyncJob>({
          resourceType: 'AsyncJob',
          type: 'data-migration',
          status: 'accepted',
          requestTime: new Date().toISOString(),
          request: 'mock-job',
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });
        await expect(maybeStartPostDeployMigration()).resolves.toMatchObject({
          id: asyncJob.id,
          type: 'data-migration',
          status: 'accepted',
        });

        const updated = await waitForCompleted(asyncJob.id);
        expect(updated).toMatchObject<Partial<AsyncJob>>({
          resourceType: 'AsyncJob',
          status: 'completed',
        });
      }));

    test('Existing data migration job in a project is ignored', () =>
      withTestContext(async () => {
        const { repo } = await createTestProject({ withRepo: true });

        // Not using system repo to create the job so that AsyncJob has a compartment
        const projectAsyncJob = await repo.createResource<AsyncJob>({
          resourceType: 'AsyncJob',
          type: 'data-migration',
          status: 'accepted',
          requestTime: new Date().toISOString(),
          request: 'mock-job',
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        const asyncJob = await maybeStartPostDeployMigration();
        if (!asyncJob) {
          throw new Error('Expected to start post-deploy migration');
        }
        expect(asyncJob).toMatchObject<AsyncJob>({
          type: 'data-migration',
          resourceType: 'AsyncJob',
          status: 'accepted',
          request: expect.any(String),
          requestTime: expect.any(String),
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        const updated = await waitForCompleted(asyncJob.id);
        expect(updated).toMatchObject<Partial<AsyncJob>>({
          resourceType: 'AsyncJob',
          status: 'completed',
        });

        // The project AsyncJob should not be found/returned
        expect(asyncJob?.id).toBeDefined();
        expect(asyncJob?.id).not.toStrictEqual(projectAsyncJob.id);
      }));

    test('Multiple data migration jobs with accepted status', () =>
      withTestContext(async () => {
        const systemRepo = getSystemRepo();
        await systemRepo.createResource<AsyncJob>({
          resourceType: 'AsyncJob',
          type: 'data-migration',
          status: 'accepted',
          requestTime: new Date().toISOString(),
          request: 'mock-job',
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        await systemRepo.createResource<AsyncJob>({
          resourceType: 'AsyncJob',
          type: 'data-migration',
          status: 'accepted',
          requestTime: new Date().toISOString(),
          request: 'mock-job',
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        await expect(maybeStartPostDeployMigration()).rejects.toThrow(
          'Unable to start post-deploy migration since there are more than one existing data-migration AsyncJob with accepted status'
        );
      }));

    test('Asserted version is less than or equal to current version', () =>
      withTestContext(async () => {
        await markPendingDataMigrationCompleted({
          resourceType: 'AsyncJob',
          type: 'data-migration',
          status: 'accepted',
          request: 'mock-data-job',
          requestTime: new Date().toISOString(),
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        await expect(maybeStartPostDeployMigration(1)).resolves.toBeUndefined();
      }));

    test('Asserted version is greater than current version AND there is NO pending migration', () =>
      withTestContext(async () => {
        await markPendingDataMigrationCompleted({
          resourceType: 'AsyncJob',
          type: 'data-migration',
          status: 'accepted',
          request: 'mock-data-job',
          requestTime: new Date().toISOString(),
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        await expect(maybeStartPostDeployMigration(2)).rejects.toThrow(
          'Post-deploy migration assertion failed. Expected pending migration to be migration 2, server has no pending post-deploy migration'
        );
      }));

    test('Asserted version is greater than current data version AND not the pending version', () =>
      withTestContext(async () => {
        await expect(
          getSystemRepo().searchOne<AsyncJob>(
            parseSearchRequest('AsyncJob', { type: 'data-migration', status: 'accepted' })
          )
        ).resolves.toBeUndefined();

        expect(await getPendingPostDeployMigration()).toStrictEqual(1);

        await expect(maybeStartPostDeployMigration(2)).rejects.toThrow(
          'Post-deploy migration assertion failed. Expected pending migration to be migration 2, server has current pending post-deploy migration 1'
        );
      }));
  });
});
