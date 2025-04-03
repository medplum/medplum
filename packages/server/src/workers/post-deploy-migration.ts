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
import { addVerboseQueueLogging, isJobActive, isJobCompatible, queueRegistry, WorkerInitializer } from './utils';

export const PostDeployMigrationQueueName = 'PostDeployMigrationQueue';

function getJobDataLoggingFields(job: Job<PostDeployJobData>): Record<string, string> {
  return {
    asyncJob: 'AsyncJob/' + job.data.asyncJobId,
    jobType: job.data.type,
  };
}

export const initPostDeployMigrationWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  const queue = new Queue<PostDeployJobData>(PostDeployMigrationQueueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 1, // No retries
    },
  });

  const worker = new Worker<PostDeployJobData>(
    PostDeployMigrationQueueName,
    async (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, async () => jobProcessor(job)),
    {
      ...config.bullmq,
      ...defaultOptions,
    }
  );
  addVerboseQueueLogging<PostDeployJobData>(queue, worker, getJobDataLoggingFields);
  return { queue, worker, name: PostDeployMigrationQueueName };
};

export async function jobProcessor(job: Job<PostDeployJobData>): Promise<void> {
  const asyncJob = await getSystemRepo().readResource<AsyncJob>('AsyncJob', job.data.asyncJobId);

  const migrationNumber = asyncJob.dataVersion;
  if (!migrationNumber) {
    throw new Error(`Post-deploy migration number (AsyncJob.dataVersion) not found in ${getReferenceString(asyncJob)}`);
  }

  if (!isJobCompatible(asyncJob)) {
    // re-queue the job for an eligible worker to pick up
    const queue = queueRegistry.get(job.queueName);
    await queue?.add(job.name, job.data, job.opts);
    return;
  }

  if (!isJobActive(asyncJob)) {
    globalLogger.info(`${PostDeployMigrationQueueName} processor skipping job since AsyncJob is not active`, {
      jobId: job.id,
      ...getJobDataLoggingFields(job),
      asyncJobStatus: asyncJob.status,
      version: migrationNumber,
    });
    return;
  }

  globalLogger.info(`${PostDeployMigrationQueueName} processor`, {
    jobId: job.id,
    ...getJobDataLoggingFields(job),
    version: migrationNumber,
  });

  const migration = getPostDeployMigration(migrationNumber);
  if (migration.type !== job.data.type) {
    throw new Error(`Post-deploy migration ${migrationNumber} is not a ${job.data.type} migration`);
  }

  const result: PostDeployJobRunResult = await migration.run(getSystemRepo(), job, job.data);

  switch (result) {
    case 'ineligible': {
      // Since we can't handle this ourselves, re-enqueue the job for another worker that can
      // Prefer job.queueName over PostDeployMigrationQueueName to ensure the job is re-queued
      // on the same queue it came from.
      const queue = queueRegistry.get(job.queueName);
      await queue?.add(job.name, job.data, job.opts);
      break;
    }
    case 'finished':
    case 'interrupted':
      break;
    default:
      result satisfies never;
      throw new Error(`Unexpected PostDeployMigration.run(${migrationNumber}) result: ${result}`);
  }
}

export async function runCustomMigration(
  repo: Repository,
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData,
  callback: (
    job: Job<CustomPostDeployMigrationJobData> | undefined,
    jobData: CustomPostDeployMigrationJobData
  ) => Promise<CustomMigrationResult>
): Promise<'finished' | 'ineligible' | 'interrupted'> {
  const asyncJob = await repo.readResource<AsyncJob>('AsyncJob', jobData.asyncJobId);

  if (!isJobActive(asyncJob)) {
    return 'interrupted';
  }

  const exec = new AsyncJobExecutor(repo, asyncJob);
  try {
    const result = await callback(job, jobData);
    const output = getAsyncJobOutputFromCustomMigrationResults(result);
    await exec.completeJob(repo, output);
  } catch (err: any) {
    await exec.failJob(repo, err);
  }
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

export async function addPostDeployMigrationJobData<T extends PostDeployJobData>(
  jobData: T,
  options?: JobsOptions
): Promise<Job<T> | undefined> {
  const asyncJob = await getSystemRepo().readResource<AsyncJob>('AsyncJob', jobData.asyncJobId);
  const deduplicationId = `v${asyncJob.dataVersion}`;

  const queue = queueRegistry.get<PostDeployJobData>(PostDeployMigrationQueueName);
  if (!queue) {
    throw new Error(`Job queue ${PostDeployMigrationQueueName} not available`);
  }

  globalLogger.debug('Adding post-deploy migration job', {
    version: `v${asyncJob.dataVersion}`,
    asyncJobId: asyncJob.id,
  });

  const job = await queue.add('PostDeployMigrationJobData', jobData, {
    ...options,
    deduplication: { id: deduplicationId },
  });

  globalLogger.info('Added post-deploy migration job', {
    jobId: job.id,
    ...getJobDataLoggingFields(job),
  });

  return job as Job<T>;
}
