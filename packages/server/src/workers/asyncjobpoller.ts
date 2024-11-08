import { AsyncJob } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config';
import { DatabaseMode, getDatabasePool } from '../database';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';

/*
 * The reindex worker updates resource rows in the database,
 * recomputing all search columns and lookup table entries.
 */

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
 * Shuts down the reindex worker.
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
  // Check status of async job
  try {
    const trackedJob = await getSystemRepo().readResource<AsyncJob>('AsyncJob', job.data.trackedJob.id as string);
    if (trackedJob.status !== 'completed' && trackedJob.status !== 'error') {
      // Re-enqueue the job
      await addAsyncJobPollerJob({ ...job.data, trackedJob }, 1000);
    } else {
      // Job has been completed
      await finalizeJob(job, trackedJob);
    }
  } catch (err) {
    const systemRepo = getSystemRepo();
    const exec = new AsyncJobExecutor(systemRepo, job.data.ownJob);
    await exec.failJob(systemRepo, err as Error);
  }
}

async function finalizeJob(job: Job<AsyncJobPollerJobData>, trackedJob: AsyncJob): Promise<void> {
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.ownJob);
  if (trackedJob.status === 'completed') {
    await onCompleteJob(job, trackedJob);
    await exec.completeJob(systemRepo);
  } else if (trackedJob.status === 'error') {
    await onFailJob(job, trackedJob);
    await exec.failJob(systemRepo);
  }
}

async function onCompleteJob(job: Job<AsyncJobPollerJobData>, _trackedJob: AsyncJob): Promise<void> {
  switch (job.data.jobType) {
    case 'dataMigration': {
      const client = await getDatabasePool(DatabaseMode.WRITER).connect();
      const migrationVersion = job.data.jobData.migrationVersion;
      globalLogger.info('Database data migration', {
        dataVersion: `v${migrationVersion}`,
        duration: `${Date.now() - job.data.jobData.startTimeMs} ms`,
      });
      await client.query('UPDATE "DatabaseMigration" SET "dataVersion"=$1', [migrationVersion]);
      break;
    }
  }
}

async function onFailJob(job: Job<AsyncJobPollerJobData>, _trackedJob: AsyncJob): Promise<void> {
  switch (job.data.jobType) {
    case 'dataMigration': {
      // Do nothing
      break;
    }
  }
}

/**
 * Returns the reindex queue instance.
 * This is used by the unit tests.
 * @returns The reindex queue (if available).
 */
export function getAsyncJobPollerQueue(): Queue<AsyncJobPollerJobData> | undefined {
  return queue;
}

export async function addAsyncJobPollerJob(
  job: AsyncJobPollerJobData,
  delay?: number
): Promise<Job<AsyncJobPollerJobData>> {
  if (!queue) {
    throw new Error('Job queue not available');
  }
  return queue.add(jobName, job, { delay });
}
