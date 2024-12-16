import { AsyncJob } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config';
import { DATA_MIGRATION_JOB_KEY, DatabaseMode, getDatabasePool, markPendingDataMigrationCompleted } from '../database';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getRedis } from '../redis';

export const DEFAULT_ASYNC_JOB_POLL_RATE_MS = 10000;

export type PolledAsyncJobType = 'dataMigration';

export type JobTypeDataMap = {
  dataMigration: { startTimeMs: number; migrationVersion: number };
};

export type AsyncJobPollerJobData<
  T extends PolledAsyncJobType = PolledAsyncJobType,
  JobData extends Record<string, any> = T extends keyof JobTypeDataMap ? JobTypeDataMap[T] : Record<string, any>,
> = {
  readonly ownJob: AsyncJob;
  readonly trackedJob: AsyncJob;
  readonly jobType: T;
  readonly jobData: JobData;
  readonly delay?: number;
};

const queueName = 'AsyncJobPollerQueue';
const jobName = 'AsyncJobPollerJob';
let queue: Queue<AsyncJobPollerJobData> | undefined = undefined;
let worker: Worker<AsyncJobPollerJobData> | undefined = undefined;

export function initAsyncJobPollerWorker(config: MedplumServerConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<AsyncJobPollerJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  worker = new Worker<AsyncJobPollerJobData>(queueName, (job) => execAsyncJobPollerJob(job), {
    ...defaultOptions,
    ...config.bullmq,
  });
  worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
}

/**
 * Shuts down the async job poller worker.
 * Closes the BullMQ job queue.
 * Closes the BullMQ worker.
 */
export async function closeAsyncJobPollerWorker(): Promise<void> {
  // Close worker first, so any jobs that need to finish can enqueue the next job before exiting
  if (worker) {
    await worker.close();
    worker = undefined;
  }

  if (queue) {
    await queue.close();
    queue = undefined;
  }
}

export async function execAsyncJobPollerJob(job: Job<AsyncJobPollerJobData>): Promise<void> {
  const systemRepo = getSystemRepo();
  try {
    // Check status of async job
    const trackedJob = await systemRepo.readResource<AsyncJob>('AsyncJob', job.data.trackedJob.id as string);
    if (trackedJob.status === 'accepted') {
      if (await shouldEnqueueJob(job, trackedJob)) {
        globalLogger.info('Requeuing job', { job: job.data });
        await addAsyncJobPollerJob({ ...job.data, trackedJob });
      }
    } else {
      // Job has been completed
      await finalizeJob(job, trackedJob);
    }
  } catch (err) {
    const exec = new AsyncJobExecutor(systemRepo, job.data.ownJob);
    await exec.failJob(systemRepo, err as Error);
  }
}

/**
 *
 * @param job - The job data for the async poller job.
 * @param trackedJob - The tracked AsyncJob.
 * @returns a Promise<boolean> which indicates whether the job should be enqueued or not.
 */
async function shouldEnqueueJob(job: Job<AsyncJobPollerJobData>, trackedJob: AsyncJob): Promise<boolean> {
  const systemRepo = getSystemRepo();
  switch (job.data.jobType) {
    case 'dataMigration': {
      // We only care about our ownJob when are checking if the job has been cancelled before re-enqueuing the polling job
      // If the polled job is already in a finalized state then we can ignore the cancel
      const ownJob = await systemRepo.readResource<AsyncJob>('AsyncJob', job.data.ownJob.id as string);
      if (ownJob.status === 'cancelled') {
        // Cancel the polled job if the parent
        await systemRepo.patchResource('AsyncJob', trackedJob.id as string, [
          { op: 'test', path: '/status', value: 'accepted' },
          { op: 'add', path: '/status', value: 'cancelled' },
        ]);
        return false;
      }
      break;
    }
  }

  return true;
}

async function finalizeJob(job: Job<AsyncJobPollerJobData>, trackedJob: AsyncJob): Promise<void> {
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.ownJob);
  if (trackedJob.status === 'completed') {
    await onCompleteJob(job, trackedJob);
    await exec.completeJob(systemRepo);
  } else if (trackedJob.status === 'error' || trackedJob.status === 'cancelled') {
    await onFailJob(job, trackedJob);
    await exec.failJob(systemRepo);
  }

  // Clear the key so that the "lock" is released
  await getRedis().del(DATA_MIGRATION_JOB_KEY);
}

async function onCompleteJob(job: Job<AsyncJobPollerJobData>, _trackedJob: AsyncJob): Promise<void> {
  switch (job.data.jobType) {
    case 'dataMigration': {
      const migrationVersion = job.data.jobData.migrationVersion;
      globalLogger.info('Database data migration', {
        dataVersion: `v${migrationVersion}`,
        duration: `${Date.now() - job.data.jobData.startTimeMs} ms`,
      });
      markPendingDataMigrationCompleted();
      await getDatabasePool(DatabaseMode.WRITER).query('UPDATE "DatabaseMigration" SET "dataVersion"=$1', [
        migrationVersion,
      ]);
      break;
    }
  }
}

async function onFailJob(job: Job<AsyncJobPollerJobData>, _trackedJob: AsyncJob): Promise<void> {
  switch (job.data.jobType) {
    case 'dataMigration': {
      const migrationVersion = job.data.jobData.migrationVersion;
      globalLogger.info('Database data migration failed', {
        dataVersion: `v${migrationVersion}`,
        duration: `${Date.now() - job.data.jobData.startTimeMs} ms`,
      });
      break;
    }
  }
}

/**
 * Returns the async job poller queue instance.
 * This is used by the unit tests.
 * @returns The async job poller queue (if available).
 */
export function getAsyncJobPollerQueue(): Queue<AsyncJobPollerJobData> | undefined {
  return queue;
}

export async function addAsyncJobPollerJob(jobData: AsyncJobPollerJobData): Promise<Job<AsyncJobPollerJobData>> {
  if (!queue) {
    throw new Error('Job queue not available');
  }
  return queue.add(jobName, jobData, { delay: jobData.delay ?? DEFAULT_ASYNC_JOB_POLL_RATE_MS });
}
