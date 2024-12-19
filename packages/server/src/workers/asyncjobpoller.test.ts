import { getReferenceString } from '@medplum/core';
import { AsyncJob } from '@medplum/fhirtypes';
import { Job, Queue } from 'bullmq';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { Repository } from '../fhir/repo';
import { createTestProject, withTestContext } from '../test.setup';
import {
  addAsyncJobPollerJob,
  AsyncJobPollerJobData,
  closeAsyncJobPollerWorker,
  execAsyncJobPollerJob,
  getAsyncJobPollerQueue,
} from './asyncjobpoller';

describe('AsyncJobPoller Worker', () => {
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await shutdownApp();
    await closeAsyncJobPollerWorker(); // Tests double close doesn't throw
  });

  describe('Scenarios', () => {
    test('Poller job cancelled', () =>
      withTestContext(async () => {
        let dataMigrationJob: AsyncJob = await repo.createResource({
          resourceType: 'AsyncJob',
          status: 'accepted',
          request: 'mock-data-migration-v1',
          requestTime: new Date().toISOString(),
        });

        const queue = jest.mocked(getAsyncJobPollerQueue() as Queue<AsyncJobPollerJobData>);

        const exec = new AsyncJobExecutor(repo);
        const pollerJob = await exec.init(getReferenceString(dataMigrationJob));
        const startTimeMs = Date.now();

        // Start the poller job
        await exec.run(async (ownJob) => {
          await addAsyncJobPollerJob({
            ownJob,
            trackedJob: dataMigrationJob,
            jobType: 'dataMigration',
            jobData: { startTimeMs, migrationVersion: 1 },
            delay: getConfig().asyncJobPollRateMilliseconds,
          });
        });

        // Make sure it was added to queue
        expect(queue.add).toHaveBeenCalledWith(
          'AsyncJobPollerJob',
          {
            ownJob: pollerJob,
            trackedJob: dataMigrationJob,
            jobType: 'dataMigration',
            jobData: { startTimeMs, migrationVersion: 1 },
            delay: 1000,
          },
          { delay: 1000 }
        );

        const job = { id: 1, data: queue.add.mock.lastCall?.[1] } as unknown as Job;

        queue.add.mockClear();

        // Execute the job since it was added to the queue
        await execAsyncJobPollerJob(job);

        // Poller job should still be in "accepted" state since polled job is not yet complete
        let asyncJob = await repo.readResource<AsyncJob>('AsyncJob', pollerJob.id as string);
        expect(asyncJob.status).toStrictEqual('accepted');

        // Make sure the job was re-added to the queue since the polled job has not completed yet and needs to be polled again
        expect(queue.add).toHaveBeenCalledWith(
          'AsyncJobPollerJob',
          {
            ownJob: pollerJob,
            trackedJob: dataMigrationJob,
            jobType: 'dataMigration',
            jobData: { startTimeMs, migrationVersion: 1 },
            delay: 1000,
          },
          { delay: 1000 }
        );

        asyncJob = await repo.updateResource({ ...asyncJob, status: 'cancelled' });
        expect(asyncJob).toBeDefined();

        // Poll again, it will see that the poller job has been called
        await execAsyncJobPollerJob(job);

        // Since we cancelled the polling job, we will also call cancel on the polled job
        dataMigrationJob = await repo.readResource<AsyncJob>('AsyncJob', dataMigrationJob.id as string);
        expect(dataMigrationJob.status).toStrictEqual('cancelled');
      }));
  });

  describe('Polling data migration job', () => {
    test.each([['completed', 'completed'] as const, ['error', 'error'] as const, ['cancelled', 'error'] as const])(
      'Data migration: %s polled status -> %s poller status',
      (polledStatus, pollerStatus) =>
        withTestContext(async () => {
          let dataMigrationJob: AsyncJob = await repo.createResource({
            resourceType: 'AsyncJob',
            status: 'accepted',
            request: 'mock-data-migration-v1',
            requestTime: new Date().toISOString(),
          });

          const queue = jest.mocked(getAsyncJobPollerQueue() as Queue<AsyncJobPollerJobData>);

          const exec = new AsyncJobExecutor(repo);
          const pollerJob = await exec.init(getReferenceString(dataMigrationJob));
          const startTimeMs = Date.now();

          // Start the poller job
          await exec.run(async (ownJob) => {
            await addAsyncJobPollerJob({
              ownJob,
              trackedJob: dataMigrationJob,
              jobType: 'dataMigration',
              jobData: { startTimeMs, migrationVersion: 1 },
              delay: getConfig().asyncJobPollRateMilliseconds,
            });
          });

          // Make sure it was added to queue
          expect(queue.add).toHaveBeenCalledWith(
            'AsyncJobPollerJob',
            {
              ownJob: pollerJob,
              trackedJob: dataMigrationJob,
              jobType: 'dataMigration',
              jobData: { startTimeMs, migrationVersion: 1 },
              delay: 1000,
            },
            { delay: 1000 }
          );

          const job = { id: 1, data: queue.add.mock.lastCall?.[1] } as unknown as Job;

          queue.add.mockClear();

          // Execute the job since it was added to the queue
          await execAsyncJobPollerJob(job);

          // Poller job should still be in "accepted" state since polled job is not yet complete
          let asyncJob = await repo.readResource<AsyncJob>('AsyncJob', pollerJob.id as string);
          expect(asyncJob.status).toStrictEqual('accepted');

          // Make sure the job was re-added to the queue since the polled job has not completed yet and needs to be polled again
          expect(queue.add).toHaveBeenCalledWith(
            'AsyncJobPollerJob',
            {
              ownJob: pollerJob,
              trackedJob: dataMigrationJob,
              jobType: 'dataMigration',
              jobData: { startTimeMs, migrationVersion: 1 },
              delay: 1000,
            },
            { delay: 1000 }
          );

          // Set polled job (data migration job) to error
          dataMigrationJob = await repo.updateResource({ ...dataMigrationJob, status: polledStatus });
          expect(dataMigrationJob).toBeDefined();

          // Poll again
          await execAsyncJobPollerJob(job);

          // This time the poller job should be completed
          asyncJob = await repo.readResource<AsyncJob>('AsyncJob', pollerJob.id as string);
          expect(asyncJob.status).toStrictEqual(pollerStatus);
        })
    );
  });
});
