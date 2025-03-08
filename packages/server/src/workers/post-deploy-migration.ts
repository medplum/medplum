import { getReferenceString, SearchRequest, WithId } from '@medplum/core';
import { AsyncJob, Parameters, ResourceType } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config/types';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { globalLogger } from '../logger';
import * as postDeployMigrations from '../migrations/data';
import { Migration, PostDeployMigration, PostDeployMigrationResult } from '../migrations/data';
import { ReindexJob, ReindexJobData } from './reindex';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';

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
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<PostDeployMigrationJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 4,
      backoff: {
        type: 'fixed',
        delay: 1000 * 60 * 10, // 10 minutes
      },
    },
  });
  // post-deploy migrations must execute sequentially
  await queue.setGlobalConcurrency(1);

  worker = new Worker<PostDeployMigrationJobData | ReindexJobData>(
    queueName,
    (job) =>
      tryRunInRequestContext(job.data.requestId, job.data.traceId, () => {
        if (job.data.type === 'reindex') {
          return new ReindexJob().execute(job as Job<ReindexJobData>);
        } else if (job.data.type === 'post-deploy-migration') {
          return execPostDeployMigrationJob(job as Job<PostDeployMigrationJobData>);
        } else {
          throw new Error(`Unknown job type: ${(job.data as any).type as unknown}`);
        }
      }),
    {
      ...defaultOptions,
      ...config.bullmq,
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

export async function execPostDeployMigrationJob(job: Job<PostDeployMigrationJobData>): Promise<void> {
  const migrationNumber = job.data.asyncJob.dataVersion;
  if (!migrationNumber) {
    throw new Error(`Migration number not found in ${getReferenceString(job.data.asyncJob)}`);
  }

  const migration = (postDeployMigrations as Record<string, Migration>)['v' + migrationNumber];
  if (!migration) {
    throw new Error(`Migration definition not found for v${migrationNumber}`);
  }

  if (!('processPostDeploy' in migration)) {
    throw new Error(`processPostDeploy function not defined for migration v${migrationNumber}`);
  }

  const postDeployMigration = migration as PostDeployMigration;

  const result = await postDeployMigration.processPostDeploy();
  const parameters = formatResults(result);

  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
  await exec.completeJob(systemRepo, parameters);
}

// /**
//  * Returns the post-deploy migration queue instance.
//  * This is used by the unit tests.
//  * @returns The post-deploy migration queue (if available).
//  */
// export function getPostDeployMigrationQueue(): Queue<PostDeployMigrationJobData> | undefined {
// return queue;
// }

function formatResults(result: PostDeployMigrationResult): Parameters {
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

async function addPostDeployMigrationJobData(
  job: PostDeployMigrationJobData | ReindexJobData
): Promise<Job<PostDeployMigrationJobData | ReindexJobData>> {
  if (!queue) {
    throw new Error('Job queue not available');
  }
  return queue.add(jobName, job);
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
      }
): Promise<Job<PostDeployMigrationJobData | ReindexJobData>> {
  const { requestId, traceId } = getRequestContext();

  if (jobData.type === 'post-deploy-migration') {
    return addPostDeployMigrationJobData({
      ...jobData,
      results: [],
      requestId,
      traceId,
    });
  } else {
    return addPostDeployMigrationJobData({
      ...jobData,
      endTimestamp: new Date(Date.now() + 1000 * 60 * 5).toISOString(), // Five minutes in the future
      startTime: Date.now(),
      results: Object.create(null),
      requestId,
      traceId,
    });
  }
}
