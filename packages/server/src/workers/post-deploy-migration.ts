import { getReferenceString, WithId } from '@medplum/core';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { Job, JobsOptions, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo, Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import {
  CustomMigrationResult,
  CustomPostDeployMigrationJobData,
  PostDeployJobData,
  PostDeployJobRunResult,
} from '../migrations/data/types';
import { getPostDeployMigration } from '../migrations/migration-utils';
import { isJobActive, isJobCompatible, QueueRegistry, queueRegistry, WorkerInitializer } from './utils';

const queueName = 'PostDeployMigrationQueue';
const jobName = 'PostDeployMigrationJobData';
let queue: Queue<PostDeployJobData> | undefined = undefined;
let worker: Worker<PostDeployJobData> | undefined = undefined;

export const initPostDeployMigrationWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<PostDeployJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 1, // No retries
    },
  });

  worker = new Worker<PostDeployJobData>(
    queueName,
    async (job) =>
      tryRunInRequestContext(job.data.requestId, job.data.traceId, async () => jobProcessor({ queueRegistry }, job)),
    {
      ...config.bullmq,
      ...defaultOptions,
    }
  );
  worker.on('failed', (job, err) =>
    globalLogger.info(`${queueName} worker failed job`, {
      jobId: job?.id,
      jobData: JSON.stringify(job?.data ?? null),
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  );
  worker.on('completed', async (job) => {
    globalLogger.info(`${queueName} worker completed job`, {
      jobId: job?.id,
      asyncJobId: job?.data?.asyncJobId,
      type: job?.data?.type,
    });
  });

  return { queue, name: queueName };
};

type JobProcessorContext = {
  queueRegistry: QueueRegistry;
};

export async function jobProcessor(context: JobProcessorContext, job: Job<PostDeployJobData>): Promise<void> {
  const asyncJob = await getSystemRepo().readResource<AsyncJob>('AsyncJob', job.data.asyncJobId);

  const migrationNumber = asyncJob.dataVersion;
  if (!migrationNumber) {
    throw new Error(`Post-deploy migration number (AsyncJob.dataVersion) not found in ${getReferenceString(asyncJob)}`);
  }

  if (!isJobCompatible(asyncJob)) {
    // re-queue the job for an eligible worker to pick up
    const queue = context.queueRegistry.getQueue(job.queueName);
    await queue?.add(job.name, job.data, job.opts);
    return;
  }

  if (!isJobActive(asyncJob)) {
    globalLogger.info(`${queueName} processor skipping job since AsyncJob is not active`, {
      jobId: job.id,
      type: job.data.type,
      asyncJob: getReferenceString(asyncJob),
      asyncJobStatus: asyncJob.status,
      version: migrationNumber,
    });
    return;
  }

  globalLogger.info(`${queueName} processor`, {
    jobId: job.id,
    asyncJobId: job?.data?.asyncJobId,
    type: job?.data?.type,
    version: migrationNumber,
  });

  const migration = getPostDeployMigration(migrationNumber);
  if (migration.type !== job.data.type) {
    throw new Error(`Post-deploy migration ${migrationNumber} is not a ${job.data.type} migration`);
  }

  let result: PostDeployJobRunResult;
  try {
    result = await migration.run(getSystemRepo(), job.data);
  } catch (err) {
    const systemRepo = getSystemRepo();
    const exec = new AsyncJobExecutor(systemRepo, asyncJob);
    await exec.failJob(systemRepo, err instanceof Error ? err : new Error(String(err)));
    throw err;
  }

  switch (result) {
    case 'finished':
      break;
    case 'ineligible': {
      // re-queue the job for an eligible worker to pick up
      const queue = context.queueRegistry.getQueue(job.queueName);
      await queue?.add(job.name, job.data, job.opts);
      break;
    }
    case 'interrupted':
      break;
    default:
      result satisfies never;
      throw new Error(`Unexpected PostDeployMigration.run(${migrationNumber}) result: ${result}`);
  }
}

export async function closePostDeployMigrationWorker(): Promise<void> {
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

export async function runCustomMigration(
  repo: Repository,
  jobData: CustomPostDeployMigrationJobData,
  callback: (jobData: CustomPostDeployMigrationJobData) => Promise<CustomMigrationResult>
): Promise<'finished' | 'ineligible' | 'interrupted'> {
  const asyncJob = await repo.readResource<AsyncJob>('AsyncJob', jobData.asyncJobId);

  if (!isJobActive(asyncJob)) {
    return 'interrupted';
  }

  const exec = new AsyncJobExecutor(repo, asyncJob);
  await exec.startAsync(async () => {
    const result = await callback(jobData);
    const output = getAsyncJobOutputFromCustomMigrationResults(result);
    return output;
  });
  return 'finished';
}

function getAsyncJobOutputFromCustomMigrationResults(result: CustomMigrationResult): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: result.actions.map((r) => {
      return {
        name: r.name,
        part: [
          {
            name: 'durationMs',
            valueInteger: r.durationMs,
          },
        ],
      };
    }),
  };
}

export function prepareCustomMigrationJobData(asyncJob: WithId<AsyncJob>): CustomPostDeployMigrationJobData {
  const { requestId, traceId } = getRequestContext();
  return {
    type: 'custom',
    asyncJobId: asyncJob.id,
    requestId,
    traceId,
  };
}

/**
 * Returns the post-deploy migration queue instance or throws if it hasn't been initialized.
 * @returns The post-deploy migration queue
 */
export function getPostDeployMigrationQueue(): NonNullable<typeof queue> {
  if (!queue) {
    throw new Error(`Post-deploy migration queue ${queueName} not available`);
  }
  return queue;
}

export async function addPostDeployMigrationJobData<T extends PostDeployJobData>(
  jobData: T,
  options?: JobsOptions
): Promise<Job<T> | undefined> {
  const asyncJob = await getSystemRepo().readResource<AsyncJob>('AsyncJob', jobData.asyncJobId);
  const deduplicationId = `v${asyncJob.dataVersion}`;

  const queue = getPostDeployMigrationQueue();
  const existingJobId = await queue.getDeduplicationJobId(deduplicationId);
  if (existingJobId) {
    globalLogger.info('Not queueing post-deploy migration job since an existing job is already in progress', {
      version: asyncJob.dataVersion,
      deduplicationId,
      existingJobId,
    });
    return undefined;
  }

  // NOTE: There exists a gap between the call to .getDeduplicationJobId() and .add() where an in-flight
  // post-deploy migration job finishes and we'd technically be allowed to queue the new job, but that
  // doesn't really seem worth worrying about here since there are other checks in place to prevent duplicate jobs

  globalLogger.debug('Queueing post-deploy migration', {
    version: `v${asyncJob.dataVersion}`,
    asyncJob: getReferenceString(asyncJob),
  });

  const bullJob = await queue.add(jobName, jobData, { ...options, deduplication: { id: deduplicationId } });

  if (!bullJob) {
    globalLogger.info('queue.add() did not return a job', {
      version: asyncJob.dataVersion,
      deduplicationId,
    });
    return undefined;
  }

  return bullJob as Job<T>;
}
