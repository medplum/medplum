// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest, createReference, getReferenceString, parseSearchRequest } from '@medplum/core';
import type { AsyncJob, Login, Practitioner, Project, ProjectMembership, User } from '@medplum/fhirtypes';
import type { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import express from 'express';
import type { Pool, PoolClient } from 'pg';
import request from 'supertest';
import { initApp, initAppServices, shutdownApp } from './app';
import { getConfig, loadTestConfig } from './config/loader';
import { DatabaseMode, getDatabasePool } from './database';
import type { Repository } from './fhir/repo';
import { getSystemRepo } from './fhir/repo';
import { globalLogger } from './logger';
import * as migrationSql from './migration-sql';
import type {
  CustomPostDeployMigration,
  CustomPostDeployMigrationJobData,
  PostDeployJobData,
} from './migrations/data/types';
import * as migrateModule from './migrations/migrate';
import { getPendingPostDeployMigration, maybeStartPostDeployMigration } from './migrations/migration-utils';
import { getLatestPostDeployMigrationVersion, MigrationVersion } from './migrations/migration-versions';
import type { MigrationAction, MigrationActionResult } from './migrations/types';
import { generateAccessToken } from './oauth/keys';
import { createTestProject, withTestContext } from './test.setup';
import * as version from './util/version';
import { PostDeployMigrationQueueName, prepareCustomMigrationJobData } from './workers/post-deploy-migration';
import type { ReindexJobData } from './workers/reindex';
import { getReindexQueue, prepareReindexJobData, ReindexJob } from './workers/reindex';
import { queueRegistry } from './workers/utils';

const DEFAULT_SERVER_VERSION = '3.3.0';
const DEFAULT_POST_DEPLOY_VERSION = 0;

const mockValues = {
  serverVersion: DEFAULT_SERVER_VERSION,
  postDeployVersion: DEFAULT_POST_DEPLOY_VERSION,
};

const mockGetPostDeployVersion = jest
  .fn<ReturnType<typeof migrationSql.getPostDeployVersion>, Parameters<typeof migrationSql.getPostDeployVersion>>()
  .mockImplementation(async () => {
    return mockValues.postDeployVersion;
  });

const mockMarkPostDeployMigrationCompleted = jest
  .fn<
    ReturnType<typeof migrationSql.markPostDeployMigrationCompleted>,
    Parameters<typeof migrationSql.markPostDeployMigrationCompleted>
  >()
  .mockImplementation(async (_pool: Pool | PoolClient, dataVersion: number) => {
    if (!Number.isInteger(dataVersion)) {
      throw new Error('Invalid data version in mocked markPostDeployMigrationCompleted: ' + dataVersion);
    }
    return dataVersion;
  });

jest.mock('./migrations/data/v1', () => {
  const { prepareCustomMigrationJobData, runCustomMigration } = jest.requireActual('./workers/post-deploy-migration');
  const migration: CustomPostDeployMigration = {
    type: 'custom',
    prepareJobData: (asyncJob) => prepareCustomMigrationJobData(asyncJob),
    run: function (repo, jobData) {
      return runCustomMigration(repo, jobData, async () => {
        const results: MigrationActionResult[] = [];
        results.push({ name: 'nothing', durationMs: 5 });
        return results;
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

function getQueueAddSpy(): jest.MockedFunctionDeep<Queue<PostDeployJobData>['add']> {
  const queue = queueRegistry.get<PostDeployJobData>(PostDeployMigrationQueueName);
  if (!queue) {
    throw new Error(`Job queue ${PostDeployMigrationQueueName} not available`);
  }
  return jest.mocked(queue.add);
}

function getReindexQueueAddSpy(): jest.MockedFunctionDeep<Queue<ReindexJobData>['add']> {
  const queue = getReindexQueue();
  if (!queue) {
    throw new Error(`Reindex job queue not available`);
  }
  return jest.mocked(queue.add);
}

function setMigrationsConfig(preDeploy: boolean, postDeploy: boolean): void {
  const config = getConfig();
  config.database.runMigrations = preDeploy;
  config.database.disableRunPostDeployMigrations = !postDeploy;
}

async function expungePostDeployMigrationAsyncJob(repo: Repository): Promise<void> {
  const jobs = (await repo.searchResources(parseSearchRequest('AsyncJob?type=data-migration'))) as WithId<AsyncJob>[];
  await repo.expungeResources(
    'AsyncJob',
    jobs.map((job) => job.id)
  );
}

describe('Database migrations', () => {
  beforeAll(async () => {
    console.log = jest.fn();

    jest.spyOn(migrationSql, 'getPostDeployVersion').mockImplementation(mockGetPostDeployVersion);
    jest
      .spyOn(migrationSql, 'markPostDeployMigrationCompleted')
      .mockImplementation(mockMarkPostDeployMigrationCompleted);
    jest.spyOn(version, 'getServerVersion').mockImplementation(() => mockValues.serverVersion);

    await loadTestConfig();
    // We want a clean history of post-deploy migration AsyncJob. init and shutdown the app
    // to facilitate expunging all relevant AsyncJob
    await initAppServices(getConfig());
    await expungePostDeployMigrationAsyncJob(getSystemRepo());
    await shutdownApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // By default, disable both pre-deploy and post-deploy migrations
    setMigrationsConfig(false, false);

    // Reset mocked return values as well
    mockValues.serverVersion = DEFAULT_SERVER_VERSION;
    mockValues.postDeployVersion = DEFAULT_POST_DEPLOY_VERSION;
  });

  describe('Database startup check', () => {
    beforeEach(() => {
      // Enable pre and post-deploy migrations since those are the code paths being tested
      setMigrationsConfig(true, true);
    });

    afterEach(async () => {
      await expungePostDeployMigrationAsyncJob(getSystemRepo());
      await shutdownApp();
    });

    test('Current version is greater than `requiredBefore`', () =>
      withTestContext(async () => {
        mockValues.serverVersion = '4.0.0';
        process.env.MEDPLUM_ENABLE_STRICT_MIGRATION_VERSION_CHECKS = 'true';
        await expect(initAppServices(getConfig())).rejects.toThrow(
          new Error(
            'Unable to run this version of Medplum server. Pending post-deploy migration v1 requires server at version 3.3.0 <= version < 4.0.0, but current server version is 4.0.0'
          )
        );
        delete process.env.MEDPLUM_ENABLE_STRICT_MIGRATION_VERSION_CHECKS;
      }));

    // 3.2.0 is less than the v1.serverVersion in the post-deploy migration manifest file,
    // but it should be effectively treated the same as other versions that are less than
    // v1.requiredBefore.
    test.each(['3.2.0', '3.3.0', '3.3.1', '3.4.0'])(
      'Current version greater than or equal to required version and less than `requiredBefore` -- version %s',
      async (serverVersion) =>
        withTestContext(async () => {
          const loggerInfoSpy = jest.spyOn(globalLogger, 'info');

          mockValues.serverVersion = serverVersion;
          mockValues.postDeployVersion = 0;

          jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('Process exited with exit code 1');
          });

          await expect(initAppServices(getConfig())).resolves.toBeUndefined();

          const queueAddSpy = getQueueAddSpy();
          expect(queueAddSpy).toHaveBeenCalledTimes(1);
          const jobData = queueAddSpy.mock.calls[0][1];

          const asyncJob = await getSystemRepo().readResource<AsyncJob>('AsyncJob', jobData.asyncJobId);

          expect(jobData).toEqual(
            expect.objectContaining<CustomPostDeployMigrationJobData>({
              ...prepareCustomMigrationJobData(asyncJob),
              // requestId and traceId will likely be different since in the mocked v1 migration,
              // the call to prepareJobData is not within `withTestContext`
              requestId: expect.any(String),
              traceId: expect.any(String),
            })
          );

          expect(asyncJob).toEqual(
            expect.objectContaining({
              type: 'data-migration',
              dataVersion: 1,
            })
          );

          loggerInfoSpy.mockRestore();
        })
    );
  });

  describe("maybeStartDataMigrations -- Schema migrations didn't run", () => {
    beforeEach(async () => {
      await initAppServices(getConfig());
    });

    afterEach(async () => {
      await expungePostDeployMigrationAsyncJob(getSystemRepo());
      await shutdownApp();
    });

    test('Schema migrations did not run', () =>
      withTestContext(async () => {
        await expect(maybeStartPostDeployMigration()).rejects.toThrow(
          'Cannot run post-deploy migration since pre-deploy migrations are disabled'
        );
      }));
  });

  describe('maybeStartPostDeployMigration -- pre-deploy migrations ran', () => {
    let queueAddSpy: jest.SpyInstance;

    beforeEach(async () => {
      setMigrationsConfig(true, false);

      await initAppServices(getConfig());

      queueAddSpy = getQueueAddSpy();
      queueAddSpy.mockClear();
    });

    afterEach(async () => {
      await expungePostDeployMigrationAsyncJob(getSystemRepo());
      await shutdownApp();
    });

    test('No data migration in progress -- start migration job', () =>
      withTestContext(async () => {
        mockValues.serverVersion = '3.3.0';
        const asyncJob = await maybeStartPostDeployMigration();
        if (!asyncJob) {
          throw new Error('Expected to start post-deploy migration');
        }

        expect(asyncJob).toMatchObject<WithId<AsyncJob>>({
          id: expect.any(String),
          type: 'data-migration',
          resourceType: 'AsyncJob',
          status: 'accepted',
          request: expect.any(String),
          requestTime: expect.any(String),
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        const expectedJobData = prepareCustomMigrationJobData(asyncJob);
        expect(queueAddSpy).toHaveBeenCalledTimes(1);
        expect(queueAddSpy.mock.lastCall[1]).toEqual(expectedJobData);
      }));

    test('No pending data migration', () =>
      withTestContext(async () => {
        const lastVersion = getLatestPostDeployMigrationVersion();
        mockValues.postDeployVersion = lastVersion;

        await expect(maybeStartPostDeployMigration()).resolves.toBeUndefined();
        expect(queueAddSpy).not.toHaveBeenCalled();
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

        const expectedJobData = prepareCustomMigrationJobData(asyncJob);
        expect(queueAddSpy).toHaveBeenCalledTimes(1);
        expect(queueAddSpy.mock.lastCall[1]).toEqual(expectedJobData);
      }));

    test('Existing data migration job in a project is ignored', () =>
      withTestContext(async () => {
        const project = await getSystemRepo().createResource<Project>({ resourceType: 'Project' });

        // Not using system repo to create the job so that AsyncJob is in a project
        const projectAsyncJob = await getSystemRepo().createResource<AsyncJob>({
          resourceType: 'AsyncJob',
          meta: {
            project: project.id,
          },
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

        expect(asyncJob).toMatchObject<WithId<AsyncJob>>({
          id: expect.any(String),
          type: 'data-migration',
          resourceType: 'AsyncJob',
          status: 'accepted',
          request: expect.any(String),
          requestTime: expect.any(String),
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        const expectedJobData = prepareCustomMigrationJobData(asyncJob);
        expect(queueAddSpy).toHaveBeenCalledTimes(1);
        expect(queueAddSpy.mock.lastCall[1]).toEqual(expectedJobData);

        // The project AsyncJob should not be found/returned
        expect(asyncJob.id).toBeDefined();
        expect(asyncJob.id).not.toStrictEqual(projectAsyncJob.id);
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
        expect(queueAddSpy).not.toHaveBeenCalled();
      }));

    test('Asserted version is less than or equal to current version', () =>
      withTestContext(async () => {
        mockValues.postDeployVersion = 2;

        await expect(maybeStartPostDeployMigration(1)).resolves.toBeUndefined();
        expect(queueAddSpy).not.toHaveBeenCalled();
      }));

    test('Asserted version is greater than current version AND there is NO pending migration', () =>
      withTestContext(async () => {
        mockValues.postDeployVersion = 1;

        await expect(maybeStartPostDeployMigration(2)).rejects.toThrow(
          'Requested post-deploy migration v2, but there are no pending post-deploy migrations.'
        );
        expect(queueAddSpy).not.toHaveBeenCalled();
      }));

    test('Asserted version is greater than current data version AND not the pending version', () =>
      withTestContext(async () => {
        mockValues.postDeployVersion = 0;

        await expect(
          getSystemRepo().searchOne<AsyncJob>(
            parseSearchRequest('AsyncJob', { type: 'data-migration', status: 'accepted' })
          )
        ).resolves.toBeUndefined();

        expect(await getPendingPostDeployMigration(getDatabasePool(DatabaseMode.WRITER))).toStrictEqual(1);

        await expect(maybeStartPostDeployMigration(2)).rejects.toThrow(
          'Requested post-deploy migration v2, but the pending post-deploy migration is v1.'
        );
        expect(queueAddSpy).not.toHaveBeenCalled();
      }));
  });

  describe('Reindex post-deploy migration', () => {
    beforeEach(async () => {
      setMigrationsConfig(true, false);

      await initAppServices(getConfig());
    });

    afterEach(async () => {
      await expungePostDeployMigrationAsyncJob(getSystemRepo());
      await shutdownApp();
    });

    test.each([
      [false, 0],
      [true, 0],
    ])('with version too low and post-deploy auto-run %s', (postDeploy, expectedQueueCalls) =>
      withTestContext(async () => {
        mockValues.serverVersion = '3.2.4';
        setMigrationsConfig(true, postDeploy);

        const systemRepo = getSystemRepo();
        let asyncJob = await systemRepo.createResource<AsyncJob>({
          resourceType: 'AsyncJob',
          type: 'data-migration',
          status: 'accepted',
          requestTime: new Date().toISOString(),
          request: '/admin/super/migrate',
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        const jobData = prepareReindexJobData(['ImmunizationEvaluation'], asyncJob.id);
        const result = await new ReindexJob().execute(undefined, jobData);

        asyncJob = await systemRepo.readResource('AsyncJob', asyncJob.id);
        expect(asyncJob.status).toStrictEqual('accepted');
        expect(result).toStrictEqual('ineligible');

        expect(getReindexQueueAddSpy()).not.toHaveBeenCalled();
        expect(getQueueAddSpy()).toHaveBeenCalledTimes(expectedQueueCalls);
      })
    );

    test.each([
      ['3.3.0', false, 0],
      ['4.0.0', true, 1],
    ])('with sufficient version %s and post-deploy auto-run %s', (serverVersion, postDeploy, expectedQueueCalls) =>
      withTestContext(async () => {
        mockValues.serverVersion = serverVersion;
        setMigrationsConfig(true, postDeploy);

        const systemRepo = getSystemRepo();
        let asyncJob = await systemRepo.createResource<AsyncJob>({
          resourceType: 'AsyncJob',
          type: 'data-migration',
          status: 'accepted',
          requestTime: new Date().toISOString(),
          request: '/admin/super/migrate',
          dataVersion: 1,
          minServerVersion: '3.3.0',
        });

        expect(mockMarkPostDeployMigrationCompleted).toHaveBeenCalledTimes(0);

        const jobData = prepareReindexJobData(['MedicinalProductContraindication'], asyncJob.id);
        await new ReindexJob().execute(undefined, jobData);

        asyncJob = await systemRepo.readResource('AsyncJob', asyncJob.id);
        expect(asyncJob.status).toStrictEqual('completed');
        expect(asyncJob.output).toMatchObject({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'result',
              part: expect.arrayContaining([
                expect.objectContaining({ name: 'resourceType', valueCode: 'MedicinalProductContraindication' }),
                expect.objectContaining({ name: 'count', valueInteger: 0 }),
              ]),
            },
          ],
        });

        // Make sure we call `markDataMigrationComplete` after the reindex job if it's a data migration
        expect(mockMarkPostDeployMigrationCompleted).toHaveBeenCalledTimes(1);

        expect(getReindexQueueAddSpy()).not.toHaveBeenCalled();
        expect(getQueueAddSpy()).toHaveBeenCalledTimes(expectedQueueCalls);
      })
    );

    test.each([
      [true, 55],
      [false, 55],
      [true, undefined],
      [false, undefined],
    ])('Skips only if in firstBoot mode [%s] and has dataVersion [%s]', async (firstBootMode, dataVersion) => {
      mockValues.postDeployVersion = firstBootMode ? MigrationVersion.FIRST_BOOT : MigrationVersion.NONE;
      const systemRepo = getSystemRepo();

      let asyncJob = await systemRepo.createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        dataVersion,
        requestTime: new Date().toISOString(),
        request: '/admin/super/reindex',
      });

      let jobData: ReindexJobData = {} as unknown as ReindexJobData;
      await withTestContext(async () => {
        jobData = prepareReindexJobData(['ValueSet'], asyncJob.id);
      });

      const reindexJob = new ReindexJob(systemRepo);
      const searchSpy = jest.spyOn(systemRepo, 'search').mockResolvedValueOnce({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: [],
      });
      await expect(reindexJob.execute(undefined, jobData)).resolves.toBe('finished');

      asyncJob = await systemRepo.readResource('AsyncJob', asyncJob.id);
      if (firstBootMode && dataVersion) {
        expect(asyncJob.status).toStrictEqual('completed');
        expect(asyncJob.output?.parameter).toEqual([{ name: 'skipped', valueString: 'In firstBoot mode' }]);
        expect(searchSpy).not.toHaveBeenCalled();
      } else {
        expect(asyncJob.status).toStrictEqual('completed');
        expect(asyncJob.output?.parameter).toEqual([
          {
            name: 'result',
            part: expect.arrayContaining([
              expect.objectContaining({ name: 'resourceType', valueCode: 'ValueSet' }),
              expect.objectContaining({ name: 'count', valueInteger: 0 }),
            ]),
          },
        ]);
        expect(searchSpy).toHaveBeenCalledTimes(1);
      }
    });
  });

  // Use a separate top-level describe since the other top-level
  // has a beforeEach that initializes and shuts down the app repeatedly.
  // Here, we want one long-running app
  describe('Super Admin routes', () => {
    const app = express();

    let adminAccessToken: string;
    let project: Project;

    beforeAll(async () => {
      const config = await loadTestConfig();
      await initApp(app, config);
      await expungePostDeployMigrationAsyncJob(getSystemRepo());

      ({ project } = await createTestProject({ withClient: true, superAdmin: true }));

      const systemRepo = getSystemRepo();

      const practitioner1 = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });

      const user1 = await systemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'Super',
        lastName: 'Admin',
        email: `super${randomUUID()}@example.com`,
        passwordHash: 'abc',
      });

      const membership1 = await systemRepo.createResource<ProjectMembership>({
        resourceType: 'ProjectMembership',
        project: createReference(project),
        user: createReference(user1),
        profile: createReference(practitioner1),
      });

      const login1 = await systemRepo.createResource<Login>({
        resourceType: 'Login',
        authMethod: 'client',
        user: createReference(user1),
        membership: createReference(membership1),
        authTime: new Date().toISOString(),
        scope: 'openid',
      });

      adminAccessToken = await generateAccessToken({
        login_id: login1.id,
        sub: user1.id,
        username: user1.id,
        profile: getReferenceString(practitioner1),
        scope: 'openid',
      });
    });

    beforeEach(async () => {
      jest.clearAllMocks();
    });

    afterEach(async () => {
      await expungePostDeployMigrationAsyncJob(getSystemRepo());
    });

    afterAll(async () => {
      await shutdownApp();
    });

    describe('Manually run post-deploy migration', () => {
      beforeEach(() => {
        setMigrationsConfig(true, false);
      });

      test.each<[boolean, boolean, 'fail' | 'pass']>([
        [false, false, 'fail'],
        [false, true, 'fail'],
        [true, false, 'pass'],
        [true, true, 'pass'],
      ])(
        'Manually run post-deploy migration with pre-deploy[%s] and post-deploy[%s]',
        async (preDeploy, postDeploy, expectedToFailOrPass) => {
          setMigrationsConfig(preDeploy, postDeploy);

          const res2 = await request(app)
            .post('/admin/super/migrate')
            .set('Authorization', 'Bearer ' + adminAccessToken)
            .set('Prefer', 'respond-async')
            .type('json')
            .send({});

          const queueAdd = getQueueAddSpy();

          if (expectedToFailOrPass === 'pass') {
            expect(res2.status).toStrictEqual(202);
            expect(res2.headers['content-location']).toBeDefined();

            expect(queueAdd).toHaveBeenCalledTimes(1);
          } else {
            expect(res2.status).toStrictEqual(400);

            const queueAdd = getQueueAddSpy();
            expect(queueAdd).not.toHaveBeenCalled();
          }
        }
      );

      test.each([true, 'true', 'false', false, 'v1', 'v2'])(
        'with invalid dataVersion specified %s',
        async (dataVersion) => {
          const res1 = await request(app)
            .post('/admin/super/migrate')
            .set('Authorization', 'Bearer ' + adminAccessToken)
            .set('Prefer', 'respond-async')
            .type('json')
            .send({ dataVersion });

          expect(res1.status).toStrictEqual(400);
          expect(res1.headers['content-location']).not.toBeDefined();
          expect(res1.body).toMatchObject(badRequest('dataVersion must be an integer'));
        }
      );

      test('with dataVersion less than or equal to current version', async () => {
        mockValues.postDeployVersion = 1;

        const res1 = await request(app)
          .post('/admin/super/migrate')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .set('Prefer', 'respond-async')
          .type('json')
          .send({ dataVersion: 1 });

        // Since the version is less than or equal to the current version,
        // nothing to do, so no AsyncJob was created and no content-location header
        // should be set
        expect(res1.body).toMatchObject(allOk);
        expect(res1.status).toStrictEqual(200);
        expect(res1.headers['content-location']).not.toBeDefined();
      });
    });

    describe('Set data version', () => {
      beforeAll(async () => {
        console.log = jest.fn();
      });

      test('Set data version -- Valid dataVersion', async () => {
        expect(mockMarkPostDeployMigrationCompleted).toHaveBeenCalledTimes(0);
        const res1 = await request(app)
          .post('/admin/super/setdataversion')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .type('json')
          .send({ dataVersion: 1337 });

        expect(res1.status).toStrictEqual(200);
        expect(res1.body).toMatchObject(allOk);
        expect(mockMarkPostDeployMigrationCompleted).toHaveBeenCalledTimes(1);
      });

      test.each([undefined, 'v1', '3.3.0'])('Set data version -- invalid dataVersion - %s', async (dataVersion) => {
        const res1 = await request(app)
          .post('/admin/super/setdataversion')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .type('json')
          .send({ dataVersion });

        expect(res1.status).toStrictEqual(400);
        expect(res1.body).toMatchObject(badRequest('dataVersion must be an integer'));
      });
    });

    describe('Reconcile schema drift', () => {
      let generateMigrationActionsSpy: jest.SpyInstance<ReturnType<typeof migrateModule.generateMigrationActions>>;

      beforeEach(() => {
        generateMigrationActionsSpy = jest.spyOn(migrateModule, 'generateMigrationActions');
      });

      afterEach(() => {
        generateMigrationActionsSpy.mockRestore();
      });

      test('Nothing to do', async () => {
        generateMigrationActionsSpy.mockResolvedValueOnce([]);
        const queueAddSpy = getQueueAddSpy();
        expect(queueAddSpy).toHaveBeenCalledTimes(0);
        const res1 = await request(app)
          .post('/admin/super/reconcile-db-schema-drift')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .set('Prefer', 'respond-async')
          .type('json');

        expect(queueAddSpy).toHaveBeenCalledTimes(0);
        expect(res1.status).toStrictEqual(200);
        expect(res1.headers['content-location']).not.toBeDefined();
      });

      test('Has schema drift', async () => {
        const pendingActions: MigrationAction[] = [
          {
            type: 'ANALYZE_TABLE',
            tableName: 'AsyncJob',
          },
        ];
        generateMigrationActionsSpy.mockResolvedValueOnce(pendingActions);

        const queueAddSpy = getQueueAddSpy();
        expect(queueAddSpy).toHaveBeenCalledTimes(0);
        const res1 = await request(app)
          .post('/admin/super/reconcile-db-schema-drift')
          .set('Authorization', 'Bearer ' + adminAccessToken)
          .set('Prefer', 'respond-async')
          .type('json');

        expect(queueAddSpy).toHaveBeenCalledTimes(1);
        const jobData = queueAddSpy.mock.calls[0][1];
        expect(jobData).toMatchObject({
          type: 'dynamic',
          migrationActions: pendingActions,
        });

        expect(res1.status).toStrictEqual(202);
        expect(res1.headers['content-location']).toBeDefined();
      });
    });
  });
});
