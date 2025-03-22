import { getReferenceString, Logger } from '@medplum/core';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { Job, Queue } from 'bullmq';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { MedplumServerConfig } from '../config/types';
import { getSystemRepo } from '../fhir/repo';
import * as logger from '../logger';
import {
  CustomMigrationAction,
  CustomPostDeployMigration,
  CustomPostDeployMigrationJobData,
  PostDeployJobData,
} from '../migrations/data/types';
import * as migrationUtils from '../migrations/migration-utils';
import { withTestContext } from '../test.setup';
import {
  addPostDeployMigrationJobData,
  closePostDeployMigrationWorker,
  getPostDeployMigrationQueue,
  initPostDeployMigrationWorker,
  jobProcessor,
  prepareCustomMigrationJobData,
  runCustomMigration,
} from './post-deploy-migration';
import { QueueRegistry } from './utils';

describe('Post-Deploy Migration Worker', () => {
  const mockQueueRegistry: jest.Mocked<QueueRegistry> = {
    getQueue: jest.fn(),
    addQueue: jest.fn(),
    clear: jest.fn(),
  };

  let config: MedplumServerConfig;

  beforeAll(async () => {
    jest.spyOn(migrationUtils, 'getPostDeployMigration');

    config = await loadTestConfig();
    await initAppServices(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Initialize and close worker and get queue', async () => {
    const result = initPostDeployMigrationWorker(config);

    expect(result).toBeDefined();
    expect(result.name).toBe('PostDeployMigrationQueue');
    expect(result.queue).toBeInstanceOf(Queue);

    const queue = getPostDeployMigrationQueue();
    expect(queue).toBe(result.queue);

    await closePostDeployMigrationWorker();
  });

  test('getPostDeployMigrationQueue throws if not initialized', async () => {
    expect(() => getPostDeployMigrationQueue()).toThrow(
      'Post-deploy migration queue PostDeployMigrationQueue not available'
    );
  });

  test('prepareCustomMigrationJobData and addPostDeployMigrationJobData', async () => {
    const queue = initPostDeployMigrationWorker(config).queue;
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

    await closePostDeployMigrationWorker();
  });

  test('Skip adding post-deploy migration job if already exists', async () => {
    const queue = initPostDeployMigrationWorker(config).queue;
    const addSpy = jest.mocked(queue.add);
    const getDeduplicationJobIdSpy = jest.mocked(queue.getDeduplicationJobId).mockResolvedValue('some-other-job-id');

    const asyncJob = await getSystemRepo().createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'accepted',
      dataVersion: 123,
      requestTime: new Date().toISOString(),
      request: '/admin/super/migrate',
    });

    await withTestContext(async () => {
      const jobData = prepareCustomMigrationJobData(asyncJob);

      const result = await addPostDeployMigrationJobData(jobData);

      expect(result).toBeUndefined();
      expect(addSpy).not.toHaveBeenCalled();
      expect(getDeduplicationJobIdSpy).toHaveBeenCalledTimes(1);
    });

    await closePostDeployMigrationWorker();
  });

  test.each<[string, Partial<AsyncJob>, boolean]>([
    ['is not active', { status: 'cancelled' }, false],
    ['has no dataVersion', { dataVersion: undefined }, true],
  ])('Job processor skips job if AsyncJob %s', async (_, jobProps, shouldThrow) => {
    const getPostDeployMigrationSpy = jest.mocked(migrationUtils.getPostDeployMigration);

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
      await expect(jobProcessor({ queueRegistry: mockQueueRegistry }, job)).rejects.toThrow(
        `Post-deploy migration number (AsyncJob.dataVersion) not found in ${getReferenceString(mockAsyncJob)}`
      );
    } else {
      await jobProcessor({ queueRegistry: mockQueueRegistry }, job);
    }

    // getting the post-deploy migration is a reasonable proxy for running the job
    // since the migration is what contains the run function.
    expect(getPostDeployMigrationSpy).not.toHaveBeenCalled();
  });

  test('Job processor runs migration when AsyncJob is active', async () => {
    const mockCustomMigration: CustomPostDeployMigration = {
      type: 'custom',
      prepareJobData: jest.fn(),
      run: jest.fn().mockImplementation(async (repo, jobData) => {
        return runCustomMigration(repo, jobData, async () => {
          const actions: CustomMigrationAction[] = [
            { name: 'first', durationMs: 111 },
            { name: 'second', durationMs: 222 },
          ];
          return { actions };
        });
      }),
    };

    const getPostDeployMigrationSpy = jest
      .mocked(migrationUtils.getPostDeployMigration)
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

    await jobProcessor({ queueRegistry: mockQueueRegistry }, job);

    expect(getPostDeployMigrationSpy).toHaveBeenCalledWith(456);
    expect(mockCustomMigration.run).toHaveBeenCalledWith(expect.any(Object), job.data);

    const updatedAsyncJob = await systemRepo.readResource<AsyncJob>('AsyncJob', mockAsyncJob.id);
    expect(updatedAsyncJob.status).toBe('completed');
    expect(updatedAsyncJob.output?.parameter).toEqual([
      { name: 'first', part: [{ name: 'durationMs', valueInteger: 111 }] },
      { name: 'second', part: [{ name: 'durationMs', valueInteger: 222 }] },
    ]);
  });

  test('Job processor re-queues ineligible jobs', async () => {
    const queue = initPostDeployMigrationWorker(config).queue;
    const addSpy = jest.mocked(queue.add);
    mockQueueRegistry.getQueue.mockReturnValue(queue);

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
      run: jest.fn().mockImplementation(async (repo, jobData) => {
        return runCustomMigration(repo, jobData, async () => {
          const actions: CustomMigrationAction[] = [
            { name: 'first', durationMs: 111 },
            { name: 'second', durationMs: 222 },
          ];
          return { actions };
        });
      }),
    };
    const getPostDeployMigrationSpy = jest
      .mocked(migrationUtils.getPostDeployMigration)
      .mockReturnValue(mockCustomMigration);

    // temporarily set to {} to appease typescript since it gets set within withTestContext
    let job: Job<PostDeployJobData> = {} as unknown as Job<PostDeployJobData>;
    await withTestContext(async () => {
      const jobData: PostDeployJobData = prepareCustomMigrationJobData(mockAsyncJob);
      job = {
        id: '1',
        name: 'PostDeployMigrationJobData',
        data: jobData,
        queueName: 'PostDeployMigrationQueue',
        opts: { attempts: 55 },
      } as unknown as Job<PostDeployJobData>;
    });
    expect(job.opts.attempts).toEqual(55);

    await jobProcessor({ queueRegistry: mockQueueRegistry }, job);

    expect(getPostDeployMigrationSpy).not.toHaveBeenCalled();
    expect(mockCustomMigration.run).not.toHaveBeenCalled();

    // Verify the job was re-queued
    expect(mockQueueRegistry.getQueue).toHaveBeenCalledWith('PostDeployMigrationQueue');
    expect(addSpy).toHaveBeenCalledWith('PostDeployMigrationJobData', job.data, { attempts: 55 });
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

    const mockCallback = jest.fn().mockResolvedValue({
      actions: [{ name: 'testAction', durationMs: 100 }],
    });

    const jobData: CustomPostDeployMigrationJobData = {
      type: 'custom',
      asyncJobId: asyncJob.id,
      requestId: '123',
      traceId: '456',
    };
    const result = await runCustomMigration(systemRepo, jobData, mockCallback);

    expect(result).toBe('finished');
    expect(mockCallback).toHaveBeenCalledWith(jobData);

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

  test('Run custom migration interrupted', async () => {
    const systemRepo = getSystemRepo();
    const asyncJob = await systemRepo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'cancelled',
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
    const mockCallback = jest.fn();

    const result = await runCustomMigration(systemRepo, jobData, mockCallback);

    expect(result).toBe('interrupted');
    expect(mockCallback).not.toHaveBeenCalled();
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

    // Create a mock logger with spy methods
    const mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    };

    const getLoggerSpy = jest.spyOn(logger, 'getLogger').mockReturnValue(mockLogger as unknown as Logger);

    const result = await runCustomMigration(systemRepo, jobData, mockCallback);
    expect(result).toBe('finished');

    const updatedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', asyncJob.id);
    expect(updatedJob.status).toBe('error');

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'AsyncJob execution failed',
      expect.objectContaining({
        asyncJobId: asyncJob.id,
        error: expect.stringContaining('Some random error'),
      })
    );

    getLoggerSpy.mockRestore();
  });
});
