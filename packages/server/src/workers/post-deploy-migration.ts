import { getReferenceString, WithId } from '@medplum/core';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { Job, JobsOptions, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo, Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import {
  CustomPostDeployMigrationJobData,
  DynamicPostDeployJobData,
  PostDeployJobData,
  PostDeployJobRunResult,
  PostDeployMigration,
} from '../migrations/data/types';
import { executeMigrationActions } from '../migrations/migrate';
import {
  getPostDeployMigration,
  MigrationDefinitionNotFoundError,
  withLongRunningDatabaseClient,
} from '../migrations/migration-utils';
import { MigrationAction, MigrationActionResult } from '../migrations/types';
import {
  addVerboseQueueLogging,
  isJobActive,
  isJobCompatible,
  moveToDelayedAndThrow,
  queueRegistry,
  WorkerInitializer,
} from './utils';

const AUTORUN = Boolean(process.env['AUTORUN_POSTDEPLOY']);

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
      concurrency: 1,
      autorun: AUTORUN,
      maxStalledCount: 1000,
    }
  );
  addVerboseQueueLogging<PostDeployJobData>(queue, worker, getJobDataLoggingFields);
  return { queue, worker, name: PostDeployMigrationQueueName };
};

export async function jobProcessor(job: Job<PostDeployJobData>): Promise<void> {
  const asyncJob = await getSystemRepo().readResource<AsyncJob>('AsyncJob', job.data.asyncJobId);

  if (!isJobCompatible(asyncJob)) {
    await moveToDelayedAndThrow(job, 'Post-deploy migration delayed since this worker is not compatible');
  }

  if (!isJobActive(asyncJob)) {
    globalLogger.info(`${PostDeployMigrationQueueName} processor skipping job since AsyncJob is not active`, {
      jobId: job.id,
      ...getJobDataLoggingFields(job),
      asyncJobStatus: asyncJob.status,
    });
    return;
  }

  if (job.data.type === 'dynamic') {
    await runDynamicMigration(getSystemRepo(), job as Job<DynamicPostDeployJobData>);
    return;
  }

  const migrationNumber = asyncJob.dataVersion;
  if (!migrationNumber) {
    throw new Error(`Post-deploy migration number (AsyncJob.dataVersion) not found in ${getReferenceString(asyncJob)}`);
  }

  let migration: PostDeployMigration;
  try {
    migration = getPostDeployMigration(migrationNumber);
  } catch (err: any) {
    if (err instanceof MigrationDefinitionNotFoundError) {
      await moveToDelayedAndThrow(
        job,
        'Post-deploy migration delayed since migration definition was not found on this worker'
      );
    }
    throw err;
  }

  if (migration.type !== job.data.type) {
    throw new Error(`Post-deploy migration ${migrationNumber} is not a ${job.data.type} migration`);
  }

  const result: PostDeployJobRunResult = await migration.run(getSystemRepo(), job, job.data);

  switch (result) {
    case 'ineligible': {
      await moveToDelayedAndThrow(job, 'Post-deploy migration delayed since worker is not eligible to execute it');
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

async function runDynamicMigration(
  repo: Repository,
  job: Job<DynamicPostDeployJobData>
): Promise<PostDeployJobRunResult> {
  const asyncJob = await repo.readResource<AsyncJob>('AsyncJob', job.data.asyncJobId);
  const exec = new AsyncJobExecutor(repo, asyncJob);
  try {
    const results = await withLongRunningDatabaseClient(async (client) => {
      return executeMigrationActions(client, job.data.migrationActions);
    });
    const output = getAsyncJobOutputFromMigrationActionResults(results);
    await exec.completeJob(repo, output);
  } catch (err: any) {
    await exec.failJob(repo, err);
  }
  return 'finished';
}

export async function runCustomMigration(
  repo: Repository,
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData,
  callback: (
    job: Job<CustomPostDeployMigrationJobData> | undefined,
    jobData: CustomPostDeployMigrationJobData
  ) => Promise<MigrationActionResult[]>
): Promise<PostDeployJobRunResult> {
  const asyncJob = await repo.readResource<AsyncJob>('AsyncJob', jobData.asyncJobId);
  const exec = new AsyncJobExecutor(repo, asyncJob);
  try {
    const results = await callback(job, jobData);
    const output = getAsyncJobOutputFromMigrationActionResults(results);
    await exec.completeJob(repo, output);
  } catch (err: any) {
    await exec.failJob(repo, err);
  }
  return 'finished';
}

function getAsyncJobOutputFromMigrationActionResults(results: MigrationActionResult[]): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: results.map((r) => {
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

export function prepareDynamicMigrationJobData(
  asyncJob: WithId<AsyncJob>,
  migrationActions: MigrationAction[]
): DynamicPostDeployJobData {
  const { requestId, traceId } = getRequestContext();
  return {
    type: 'dynamic',
    migrationActions,
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
