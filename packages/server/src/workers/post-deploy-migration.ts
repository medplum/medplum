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

export type CustomMigrationJobData = {
  readonly type: 'custom';
  readonly asyncJob: WithId<AsyncJob>;
  readonly results: CustomMigrationResult;
  readonly requestId?: string;
  readonly traceId?: string;
};

export type CustomMigrationAction = { name: string; durationMs: number };
export type CustomMigrationResult = { actions: CustomMigrationAction[] };

const queueName = 'PostDeployMigrationQueue';
const jobName = 'PostDeployMigrationJobData';
let queue: Queue<CustomMigrationJobData | ReindexJobData> | undefined = undefined;
let worker: Worker<CustomMigrationJobData | ReindexJobData> | undefined = undefined;

export async function initPostDeployMigrationWorker(config: MedplumServerConfig): Promise<void> {
  if (queue && worker) {
    return;
  }

  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<CustomMigrationJobData | ReindexJobData>(queueName, {
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

  worker = new Worker<CustomMigrationJobData | ReindexJobData>(
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
        } else if (job.data.type === 'custom') {
          return executeCustomMigrationJob(job as Job<CustomMigrationJobData>);
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

async function executeCustomMigrationJob(job: Job<CustomMigrationJobData>): Promise<void> {
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
  exec.start(async (asyncJob) => {
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
function getPostDeployMigrationQueue(): NonNullable<typeof queue> {
  if (!queue) {
    throw new Error(`Post-deploy migration queue ${queueName} not available`);
  }
  return queue;
}

export async function addPostDeployMigrationJobData<T extends CustomMigrationJobData | ReindexJobData>(
  job: T,
  options?: JobsOptions
): Promise<Job<T>> {
  const queue = getPostDeployMigrationQueue();
  return queue.add(jobName, job, options) as Promise<Job<T>>;
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
