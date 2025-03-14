import { getReferenceString, SearchRequest, WithId } from '@medplum/core';
import { AsyncJob, Parameters, ResourceType } from '@medplum/fhirtypes';
import { Job, JobsOptions, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config/types';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { ReindexJob, ReindexJobData } from './reindex';
import { getPostDeployMigration } from '../migrations/migration-utils';
import { checkAsyncJobStatus, QueueRegistry } from './utils';
import { maybeRunPendingPostDeployMigration } from '../database';

export interface PostDeployJobData {
  asyncJob: WithId<AsyncJob>;
}

export interface CustomMigrationJobData extends PostDeployJobData {
  readonly type: 'custom';
  readonly results: CustomMigrationResult;
  readonly requestId?: string;
  readonly traceId?: string;
}

export type CustomMigrationAction = { name: string; durationMs: number };
export type CustomMigrationResult = { actions: CustomMigrationAction[] };

const queueName = 'PostDeployMigrationQueue';
const jobName = 'PostDeployMigrationJobData';
let queue: Queue<CustomMigrationJobData | ReindexJobData> | undefined = undefined;
let worker: Worker<CustomMigrationJobData | ReindexJobData> | undefined = undefined;

export async function initPostDeployMigrationWorker(
  config: MedplumServerConfig,
  queueRegistry: QueueRegistry
): Promise<void> {
  if (queue && worker) {
    return;
  }

  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<CustomMigrationJobData | ReindexJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 1, // No retries
    },
  });
  queueRegistry.addQueue(queueName, queue);
  // Ensure post-deploy migrations execute sequentially by only allowing one worker
  await queue.setGlobalConcurrency(1);

  worker = new Worker<CustomMigrationJobData | ReindexJobData>(
    queueName,
    async (job) =>
      tryRunInRequestContext(job.data.requestId, job.data.traceId, async () => {
        globalLogger.debug('post-deploy-migration worker', {
          jobId: job.id,
          type: job.data.type,
          version: job.data.asyncJob.dataVersion,
        });

        const isActive = await checkAsyncJobStatus(getSystemRepo(), job);
        if (!isActive) {
          globalLogger.debug('post-deploy-migration worker skipping job since AsyncJob is not active', {
            type: job.data.type,
            jobId: job.id,
            asyncJob: getReferenceString(job.data.asyncJob),
            asyncJobStatus: job.data.asyncJob.status,
            version: job.data.asyncJob.dataVersion,
          });
          return;
        }

        //TODO{mattlong} ensure this is the next post-deploy migration that should be run, fail if not

        if (job.data.type === 'reindex') {
          await new ReindexJob().execute(job as Job<ReindexJobData>);
        } else if (job.data.type === 'custom') {
          await executeCustomMigrationJob(job as Job<CustomMigrationJobData>);
        } else {
          throw new Error(`Unknown job type: ${(job.data as any).type as unknown}`);
        }
      }),
    {
      ...config.bullmq,
      ...defaultOptions,
    }
  );
  worker.on('failed', (job, err) => globalLogger.info(`PostDeployMigration worker failed job ${job?.id} with ${err}`));
  worker.on('completed', async (job) => {
    globalLogger.info(`PostDeployMigration worker completed job ${job?.id}`);
    await maybeRunPendingPostDeployMigration();
  });
}

/**
 * Shuts down the worker.
 * Closes the BullMQ job queue.
 * Closes the BullMQ worker.
 */
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

async function executeCustomMigrationJob(job: Job<CustomMigrationJobData>): Promise<any> {
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
  return exec.startAsync(async (asyncJob) => {
    if (!asyncJob.dataVersion) {
      throw new Error(`Migration number (AsyncJob.dataVersion) not found in ${getReferenceString(asyncJob)}`);
    }
    const migration = getPostDeployMigration(asyncJob.dataVersion);
    if (migration.type !== 'custom') {
      throw new Error(`Post-deploy migration ${asyncJob.dataVersion} is not a custom migration`);
    }

    globalLogger.info('post-deploy-migration worker executing process', {
      version: asyncJob.dataVersion,
    });
    const result = await migration.process(job);
    globalLogger.info('post-deploy-migration worker completed process', {
      version: asyncJob.dataVersion,
    });
    const output = getAsyncJobOutputFromResults(result);
    return output;
  });
}

function getAsyncJobOutputFromResults(result: CustomMigrationResult): Parameters {
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

export async function addPostDeployMigrationJobData<T extends CustomMigrationJobData | ReindexJobData>(
  job: T,
  options?: JobsOptions
): Promise<Job<T>> {
  globalLogger.debug('Queueing post-deploy migration', {
    version: `v${job.asyncJob.dataVersion}`,
    asyncJob: getReferenceString(job.asyncJob),
  });
  const queue = getPostDeployMigrationQueue();
  return queue.add(jobName, job, { ...options /*jobId: `v${job.asyncJob.dataVersion}` */ }) as Promise<Job<T>>;
}

export async function addPostDeployMigrationJob(
  jobData:
    | { type: 'custom'; asyncJob: WithId<AsyncJob> }
    | {
        type: 'reindex';
        asyncJob: WithId<AsyncJob>;
        resourceTypes: ResourceType[];
        searchFilter?: SearchRequest;
        maxResourceVersion?: number;
      },
  isFirstServerStart: boolean,
  options?: {
    jobOptions?: JobsOptions;
  }
): Promise<Job<CustomMigrationJobData | ReindexJobData>> {
  const { requestId, traceId } = getRequestContext();

  if (jobData.type === 'custom') {
    return addPostDeployMigrationJobData(
      {
        ...jobData,
        results: { actions: [] },
        requestId,
        traceId,
      },
      options?.jobOptions
    );
  } else if (jobData.type === 'reindex') {
    return addPostDeployMigrationJobData(
      {
        ...jobData,
        endTimestamp: new Date(Date.now() + 1000 * 60 * 5).toISOString(), // Five minutes in the future
        startTime: Date.now(),
        results: Object.create(null),
        requestId,
        traceId,
        // If this is an fresh, empty database, optimize for speed and run 200 iterations per job
        // since most resource types will have no resources to process yet.
        iterationsPerJob: isFirstServerStart ? 200 : undefined,
      },
      options?.jobOptions
    );
  } else {
    throw new Error(`Unknown post-deploy migration job type: ${(jobData as any).type}`);
  }
}
