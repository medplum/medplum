// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { DelayedError, Job, Queue } from 'bullmq';
import { closeWorkers, initWorkers } from '.';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
import { getSystemRepo } from '../fhir/repo';
import {
  CustomPostDeployMigration,
  CustomPostDeployMigrationJobData,
  PostDeployJobData,
} from '../migrations/data/types';
import * as migrateModule from '../migrations/migrate';
import * as migrationUtils from '../migrations/migration-utils';
import { MigrationAction, MigrationActionResult } from '../migrations/types';
import { getRegisteredServers, ServerRegistryInfo } from '../server-registry';
import { withTestContext } from '../test.setup';
import * as versionModule from '../util/version';
import { getServerVersion } from '../util/version';
import {
  addPostDeployMigrationJobData,
  jobProcessor,
  PostDeployMigrationQueueName,
  prepareCustomMigrationJobData,
  prepareDynamicMigrationJobData,
  runCustomMigration,
} from './post-deploy-migration';
import { queueRegistry } from './utils';

jest.mock('../server-registry');

describe('Post-Deploy Migration Worker', () => {
  let config: MedplumServerConfig;
  let mockRegisteredServers: ServerRegistryInfo[];

  beforeAll(async () => {
    config = await loadTestConfig();

    // initialize everything but workers
    await initAppServices(config);
    await closeWorkers();
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockRegisteredServers = [
      {
        id: 'test-id',
        firstSeen: '2022-12-29T15:00:00Z',
        lastSeen: '2025-06-27T17:26:00Z',
        version: getServerVersion(),
        fullVersion: getServerVersion() + '-test',
      },
    ];
    (getRegisteredServers as jest.Mock).mockImplementation(() => mockRegisteredServers);
  });

  afterEach(async () => {
    await closeWorkers();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Initialize and close worker', async () => {
    let queue = queueRegistry.get(PostDeployMigrationQueueName);
    expect(queue).toBeUndefined();

    await initWorkers(config);

    queue = queueRegistry.get(PostDeployMigrationQueueName);
    expect(queue).toBeDefined();
    expect(queue).toBeInstanceOf(Queue);
  });

  function getQueueFromRegistryOrThrow(): Queue<PostDeployJobData> {
    const queue = queueRegistry.get<PostDeployJobData>(PostDeployMigrationQueueName);
    if (!queue) {
      throw new Error(`Job queue ${PostDeployMigrationQueueName} not available`);
    }
    return queue;
  }

  test('prepareCustomMigrationJobData and addPostDeployMigrationJobData', async () => {
    await initWorkers(config);

    const queue = getQueueFromRegistryOrThrow();
    const addSpy = jest.mocked(queue.add).mockImplementation(async (jobName, jobData, options) => {
      return {
        id: '123',
        name: jobName,
        data: jobData,
        opts: options,
      } as unknown as Job<PostDeployJobData>;
    });

    await withTestContext(async () => {
      const asyncJob = await getSystemRepo().createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        dataVersion: 123,
        requestTime: new Date().toISOString(),
        request: '/admin/super/migrate',
      });

      const jobData = prepareCustomMigrationJobData(asyncJob);

      const result = await addPostDeployMigrationJobData(jobData);

      expect(result).toEqual(
        expect.objectContaining({
          data: jobData,
        })
      );
      expect(addSpy).toHaveBeenCalledWith('PostDeployMigrationJobData', jobData, {
        deduplication: { id: expect.any(String) },
      });
    });
  });

  test.each<[string, Partial<AsyncJob>, boolean]>([
    ['is not active', { status: 'cancelled' }, false],
    ['has no dataVersion', { dataVersion: undefined }, true],
  ])('Job processor skips job if AsyncJob %s', async (_, jobProps, shouldThrow) => {
    const getPostDeployMigrationSpy = jest.spyOn(migrationUtils, 'getPostDeployMigration');

    const mockAsyncJob = await getSystemRepo().createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      dataVersion: 456,
      requestTime: new Date().toISOString(),
      request: '/admin/super/migrate',
      ...jobProps,
    });

    // temporarily set to {} to appease typescript since it gets set within withTestContext
    let job: Job<PostDeployJobData> = {} as unknown as Job<PostDeployJobData>;
    await withTestContext(async () => {
      const jobData: PostDeployJobData = prepareCustomMigrationJobData(mockAsyncJob);
      job = {
        id: '1',
        data: jobData,
        queueName: 'PostDeployMigrationQueue',
      } as unknown as Job<PostDeployJobData>;
    });
    expect(job.data).toBeDefined();

    if (shouldThrow) {
      await expect(jobProcessor(job)).rejects.toThrow(
        `Post-deploy migration number (AsyncJob.dataVersion) not found in ${getReferenceString(mockAsyncJob)}`
      );
    } else {
      await jobProcessor(job);
    }

    // getting the post-deploy migration is a reasonable proxy for running the job
    // since the migration is what contains the run function.
    expect(getPostDeployMigrationSpy).not.toHaveBeenCalled();
  });

  test('Job processor runs dynamic migration when AsyncJob is active', async () => {
    const getPostDeployMigrationSpy = jest.spyOn(migrationUtils, 'getPostDeployMigration').mockImplementation(() => {
      throw new Error('Should not be called');
    });

    const executeMigrationActionsSpy = jest.spyOn(migrateModule, 'executeMigrationActions').mockResolvedValue([
      {
        name: 'some-action',
        durationMs: 10,
      },
    ]);

    const systemRepo = getSystemRepo();
    const mockAsyncJob = await systemRepo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      requestTime: new Date().toISOString(),
      request: '/admin/super/reconcile-schema-drift',
    });

    const migrationActions: MigrationAction[] = [
      {
        type: 'CREATE_INDEX',
        indexName: 'some_necessary_test_index',
        createIndexSql: 'CREATE INDEX some_necessary_test_index ON Observation (id)',
      },
    ];

    // temporarily set to {} to appease typescript since it gets set within withTestContext
    let job: Job<PostDeployJobData> = {} as unknown as Job<PostDeployJobData>;
    await withTestContext(async () => {
      const jobData: PostDeployJobData = prepareDynamicMigrationJobData(mockAsyncJob, migrationActions);
      job = {
        id: '1',
        data: jobData,
        queueName: 'PostDeployMigrationQueue',
      } as unknown as Job<PostDeployJobData>;
    });
    expect(job.data).toBeDefined();

    await jobProcessor(job);

    expect(getPostDeployMigrationSpy).not.toHaveBeenCalled();
    expect(executeMigrationActionsSpy).toHaveBeenCalledTimes(1);
    expect(executeMigrationActionsSpy).toHaveBeenCalledWith(expect.any(Object), migrationActions);

    const updatedAsyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', mockAsyncJob.id);
    expect(updatedAsyncJob.status).toBe('completed');
    expect(updatedAsyncJob.output?.parameter).toEqual([
      { name: 'some-action', part: [{ name: 'durationMs', valueInteger: 10 }] },
    ]);

    getPostDeployMigrationSpy.mockRestore();
    executeMigrationActionsSpy.mockRestore();
  });

  test('Job processor runs migration when AsyncJob is active', async () => {
    const mockCustomMigration: CustomPostDeployMigration = {
      type: 'custom',
      prepareJobData: jest.fn(),
      run: jest.fn().mockImplementation(async (repo, job, jobData) => {
        return runCustomMigration(repo, job, jobData, async () => {
          const results: MigrationActionResult[] = [
            { name: 'first', durationMs: 111 },
            { name: 'second', durationMs: 222 },
          ];
          return results;
        });
      }),
    };

    const getPostDeployMigrationSpy = jest
      .spyOn(migrationUtils, 'getPostDeployMigration')
      .mockReturnValue(mockCustomMigration);

    const systemRepo = getSystemRepo();
    const mockAsyncJob = await systemRepo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      dataVersion: 456,
      requestTime: new Date().toISOString(),
      request: '/admin/super/migrate',
    });

    // temporarily set to {} to appease typescript since it gets set within withTestContext
    let job: Job<PostDeployJobData> = {} as unknown as Job<PostDeployJobData>;
    await withTestContext(async () => {
      const jobData: PostDeployJobData = prepareCustomMigrationJobData(mockAsyncJob);
      job = {
        id: '1',
        data: jobData,
        queueName: 'PostDeployMigrationQueue',
      } as unknown as Job<PostDeployJobData>;
    });
    expect(job.data).toBeDefined();

    await jobProcessor(job);

    expect(getPostDeployMigrationSpy).toHaveBeenCalledWith(456);
    expect(mockCustomMigration.run).toHaveBeenCalledWith(expect.any(Object), job, job.data);

    const updatedAsyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', mockAsyncJob.id);
    expect(updatedAsyncJob.status).toBe('completed');
    expect(updatedAsyncJob.output?.parameter).toEqual([
      { name: 'first', part: [{ name: 'durationMs', valueInteger: 111 }] },
      { name: 'second', part: [{ name: 'durationMs', valueInteger: 222 }] },
    ]);
  });

  test.each(['some-token', undefined])(
    'Job processor re-queues ineligible jobs with job.token %s',
    async (jobToken) => {
      await initWorkers(config);

      const queue = getQueueFromRegistryOrThrow();

      const mockAsyncJob = await getSystemRepo().createResource<AsyncJob>({
        resourceType: 'AsyncJob',
        status: 'accepted',
        dataVersion: 456,
        requestTime: new Date().toISOString(),
        request: '/admin/super/migrate',
        minServerVersion: '10.2.1',
      });

      const mockCustomMigration: CustomPostDeployMigration = {
        type: 'custom',
        prepareJobData: jest.fn(),
        run: jest.fn().mockImplementation(async (repo, job, jobData) => {
          return runCustomMigration(repo, job, jobData, async () => {
            const results: MigrationActionResult[] = [
              { name: 'first', durationMs: 111 },
              { name: 'second', durationMs: 222 },
            ];
            return results;
          });
        }),
      };
      const getPostDeployMigrationSpy = jest
        .spyOn(migrationUtils, 'getPostDeployMigration')
        .mockReturnValue(mockCustomMigration);

      // temporarily set to {} to appease typescript since it gets set within withTestContext
      let job: Job<PostDeployJobData> = {} as unknown as Job<PostDeployJobData>;
      await withTestContext(async () => {
        const jobData: PostDeployJobData = prepareCustomMigrationJobData(mockAsyncJob);
        job = new Job(queue, 'PostDeployMigrationJobData', jobData);
        // Since the Job class is fully mocked, we need to set the data property manually
        job.data = jobData;
        // job.token generally gets set deep in the internals of bullmq, but we mock the module
        job.token = jobToken;
      });

      // DelayedError is part of the mocked bullmq module. Something about that causes
      // the usual `expect(...).rejects.toThrow(...)`; it seems to be because DelayedError
      // is no longer an `Error`. So instead, we manually check that it threw
      let threw = undefined;
      let manuallyThrownError = undefined;
      try {
        await jobProcessor(job);
        manuallyThrownError = new Error(
          jobToken ? 'Expected job to throw DelayedError' : 'Expected job to throw Error'
        );
        throw manuallyThrownError;
      } catch (err) {
        threw = err;
      }
      expect(threw).toBeDefined();
      expect(threw).not.toBe(manuallyThrownError);
      expect(threw).toBeInstanceOf(jobToken ? DelayedError : Error);

      expect(getPostDeployMigrationSpy).not.toHaveBeenCalled();
      expect(mockCustomMigration.run).not.toHaveBeenCalled();

      if (jobToken) {
        expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
        expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), jobToken);
      } else {
        expect(job.moveToDelayed).not.toHaveBeenCalled();
      }
      getPostDeployMigrationSpy.mockRestore();
    }
  );

  test('Job processor delays job when migration definition is not found', async () => {
    await initWorkers(config);

    const mockAsyncJob = await getSystemRepo().createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      dataVersion: 456,
      requestTime: new Date().toISOString(),
      request: '/admin/super/migrate',
      minServerVersion: '1.0.0',
    });

    const mockCustomMigration: CustomPostDeployMigration = {
      type: 'custom',
      prepareJobData: jest.fn(),
      run: jest.fn().mockImplementation(async (repo, job, jobData) => {
        return runCustomMigration(repo, job, jobData, async () => {
          const results: MigrationActionResult[] = [
            { name: 'first', durationMs: 111 },
            { name: 'second', durationMs: 222 },
          ];
          return results;
        });
      }),
    };

    const queue = getQueueFromRegistryOrThrow();

    // temporarily set to {} to appease typescript since it gets set within withTestContext
    let job: Job<PostDeployJobData> = {} as unknown as Job<PostDeployJobData>;
    await withTestContext(async () => {
      const jobData: PostDeployJobData = prepareCustomMigrationJobData(mockAsyncJob);
      job = new Job(queue, 'PostDeployMigrationJobData', jobData);
      // Since the Job class is fully mocked, we need to set the data property manually
      job.data = jobData;
      // job.token generally gets set deep in the internals of bullmq, but we mock the module
      job.token = 'some-token';
    });

    await expect(jobProcessor(job)).rejects.toBeInstanceOf(DelayedError);
    expect(mockCustomMigration.run).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'some-token');
  });

  test.each([
    ['delays job when server cluster is not compatible', true],
    ['runs job when server cluster is compatible', false],
  ])('Job process %s ', async (_msg, includeOldServer) => {
    const mockServerVersion = '4.3.0';
    const oldServerVersion = '4.2.2';
    jest.spyOn(versionModule, 'getServerVersion').mockImplementation(() => mockServerVersion);
    await initWorkers(config);

    const mockAsyncJob = await getSystemRepo().createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      dataVersion: 13,
      requestTime: new Date().toISOString(),
      request: '/admin/super/migrate',
      minServerVersion: mockServerVersion,
    });

    const mockCustomMigration: CustomPostDeployMigration = {
      type: 'custom',
      prepareJobData: jest.fn(),
      run: jest.fn().mockImplementation(async (repo, job, jobData) => {
        return runCustomMigration(repo, job, jobData, async () => {
          const results: MigrationActionResult[] = [
            { name: 'first', durationMs: 111 },
            { name: 'second', durationMs: 222 },
          ];
          return results;
        });
      }),
    };
    const getPostDeployMigrationSpy = jest
      .spyOn(migrationUtils, 'getPostDeployMigration')
      .mockReturnValue(mockCustomMigration);

    mockRegisteredServers = [
      {
        id: 'current-server-id',
        firstSeen: '2022-12-29T15:00:00Z',
        lastSeen: '2025-06-27T17:26:00Z',
        version: mockServerVersion,
        fullVersion: mockServerVersion + '-test',
      },
    ];

    if (includeOldServer) {
      mockRegisteredServers.push({
        id: 'old-server-id',
        firstSeen: '2022-12-29T15:00:00Z',
        lastSeen: '2025-06-27T17:26:00Z',
        version: oldServerVersion,
        fullVersion: oldServerVersion + '-test',
      });
    }

    const queue = getQueueFromRegistryOrThrow();

    // temporarily set to {} to appease typescript since it gets set within withTestContext
    let job: Job<PostDeployJobData> = {} as unknown as Job<PostDeployJobData>;
    await withTestContext(async () => {
      const jobData: PostDeployJobData = prepareCustomMigrationJobData(mockAsyncJob);
      job = new Job(queue, 'PostDeployMigrationJobData', jobData);
      // Since the Job class is fully mocked, we need to set the data property manually
      job.data = jobData;
      // job.token generally gets set deep in the internals of bullmq, but we mock the module
      job.token = 'some-token';
    });

    if (includeOldServer) {
      process.env.MEDPLUM_ENABLE_STRICT_MIGRATION_VERSION_CHECKS = 'true';
      await expect(jobProcessor(job)).rejects.toBeInstanceOf(DelayedError);
      delete process.env.MEDPLUM_ENABLE_STRICT_MIGRATION_VERSION_CHECKS;
      expect(mockCustomMigration.run).not.toHaveBeenCalled();
      expect(job.moveToDelayed).toHaveBeenCalledTimes(1);
      expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'some-token');
    } else {
      await expect(jobProcessor(job)).resolves.toBeUndefined();
      expect(mockCustomMigration.run).toHaveBeenCalled();
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    }
    expect(getPostDeployMigrationSpy).toHaveBeenCalledWith(13);
  });

  test('Run custom migration success', async () => {
    const systemRepo = getSystemRepo();
    const asyncJob = await systemRepo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      dataVersion: 123,
      requestTime: new Date().toISOString(),
      request: '/admin/super/migrate',
    });

    const mockCallback = jest.fn().mockResolvedValue([{ name: 'testAction', durationMs: 100 }]);

    const jobData: CustomPostDeployMigrationJobData = {
      type: 'custom',
      asyncJobId: asyncJob.id,
      requestId: '123',
      traceId: '456',
    };
    const result = await runCustomMigration(systemRepo, undefined, jobData, mockCallback);

    expect(result).toBe('finished');
    expect(mockCallback).toHaveBeenCalledWith(undefined, jobData);

    const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
    expect(updatedJob.status).toBe('completed');
    expect(updatedJob.output).toMatchObject<Partial<Parameters>>({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'testAction',
          part: [{ name: 'durationMs', valueInteger: 100 }],
        },
      ],
    });
  });

  test('Run custom migration with error', async () => {
    const systemRepo = getSystemRepo();
    const asyncJob = await systemRepo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      dataVersion: 123,
      requestTime: new Date().toISOString(),
      request: '/admin/super/migrate',
    });

    const jobData: CustomPostDeployMigrationJobData = {
      type: 'custom',
      asyncJobId: asyncJob.id,
      requestId: '123',
      traceId: '456',
    };
    const mockCallback = jest.fn().mockImplementation(() => {
      throw new Error('Some random error');
    });

    const result = await runCustomMigration(systemRepo, undefined, jobData, mockCallback);
    expect(result).toBe('finished');

    const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
    expect(updatedJob.status).toBe('error');
  });
});
