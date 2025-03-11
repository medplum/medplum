import { getReferenceString, SearchRequest, WithId } from '@medplum/core';
import { AsyncJob, Parameters, ResourceType } from '@medplum/fhirtypes';
import { Job, JobsOptions, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config/types';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import * as postDeployMigrations from '../migrations/data';
import { Migration, PostDeployMigration, PostDeployMigrationResult } from '../migrations/data';
import { ReindexJob, ReindexJobData } from './reindex';

export type PostDeployMigrationJobData = {
  readonly type: 'post-deploy-migration';
  readonly asyncJob: WithId<AsyncJob>;
  readonly results: PostDeployMigrationResult;
  readonly requestId?: string;
  readonly traceId?: string;
};

const queueName = 'PostDeployMigrationQueue';
const jobName = 'PostDeployMigrationJobData';
let queue: Queue<PostDeployMigrationJobData | ReindexJobData> | undefined = undefined;
let worker: Worker<PostDeployMigrationJobData | ReindexJobData> | undefined = undefined;

export async function initPostDeployMigrationWorker(config: MedplumServerConfig): Promise<void> {
  if (queue && worker) {
    return;
  }

  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<PostDeployMigrationJobData | ReindexJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      // aside from jobs being interrupted/stalled, we don't expect any other failures, so use a modest retry policy
      attempts: 7, // includes the initial attempt, so retries six times after: 1, 2, 4, 8, 16, 32 minutes
      backoff: {
        type: 'exponential', // 2 ^ (attempt - 1) * delay
        delay: 1000 * 60, // 1 minute:
      },
    },
  });
  // Ensure post-deploy migrations execute sequentially by only allowing one worker
  await queue.setGlobalConcurrency(1);

  worker = new Worker<PostDeployMigrationJobData | ReindexJobData>(
    queueName,
    async (job) =>
      tryRunInRequestContext(job.data.requestId, job.data.traceId, async () => {
        // globalLogger.info('post-deploy-migration worker processing', {
        //   type: job.data.type,
        //   version: job.data.asyncJob.dataVersion,
        // });
        if (job.data.type === 'reindex') {
          return new ReindexJob().execute(job as Job<ReindexJobData>, {
            iterationsPerJob: job.data.iterationsPerJob,
          });
        } else if (job.data.type === 'post-deploy-migration') {
          return executePostDeployMigrationJob(job as Job<PostDeployMigrationJobData>);
        } else {
          throw new Error(`Unknown job type: ${(job.data as any).type as unknown}`);
        }
      }),
    {
      ...config.bullmq,
      ...defaultOptions,
      // Every time a server stops while a job is in process, the job is stalled
      // Since post-deploy migrations can take a very long time (days or weeks), they are expected
      // to be interrupted by server reboots/redeploys of new versions, so allow for a lot of stalled jobs
      maxStalledCount: 500,
    }
  );
  worker.on('failed', (job, err) => globalLogger.info(`Failed PostDeployMigrationJob ${job?.id} with ${err}`));
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

function getPostDeployMigration(asyncJob: AsyncJob): PostDeployMigration {
  const migrationNumber = asyncJob.dataVersion;
  if (!migrationNumber) {
    throw new Error(` Migration number (AsyncJob.dataVersion) not found in ${getReferenceString(asyncJob)}`);
  }

  // Get the post-deploy migration from the post-deploy migrations module
  const migration = (postDeployMigrations as Record<string, Migration>)['v' + migrationNumber];
  if (!migration) {
    throw new Error(`Migration definition not found for v${migrationNumber}`);
  }

  // Ensure that the migration defines the necessary interface
  if (!('process' in migration) || typeof migration.process !== 'function') {
    throw new Error(`process function not defined for migration v${migrationNumber}`);
  }

  return migration as PostDeployMigration;
}

export async function executePostDeployMigrationJob(job: Job<PostDeployMigrationJobData>): Promise<void> {
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
  exec.start(async (asyncJob) => {
    const postDeployMigration = getPostDeployMigration(asyncJob);

    globalLogger.info('post-deploy-migration worker executing process', {
      version: asyncJob.dataVersion,
    });
    const result = await postDeployMigration.process(job);
    const output = getAsyncJobOutputFromResults(result);
    return output;
  });
}

function getAsyncJobOutputFromResults(result: PostDeployMigrationResult): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: result.map((r) => {
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
    throw new Error(`Job queue ${queueName} not available`);
  }
  return queue;
}

async function addPostDeployMigrationJobData(
  job: PostDeployMigrationJobData | ReindexJobData,
  options?: JobsOptions
): Promise<Job<PostDeployMigrationJobData | ReindexJobData>> {
  if (!queue) {
    throw new Error('Job queue not available');
  }
  return queue.add(jobName, job, options);
}

export async function addPostDeployMigrationJob(
  jobData:
    | { type: 'post-deploy-migration'; asyncJob: WithId<AsyncJob> }
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
): Promise<Job<PostDeployMigrationJobData | ReindexJobData>> {
  const { requestId, traceId } = getRequestContext();

  if (jobData.type === 'post-deploy-migration') {
    return addPostDeployMigrationJobData(
      {
        ...jobData,
        results: [],
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
    throw new Error(`Unknown job type: ${(jobData as any).type}`);
  }
}
