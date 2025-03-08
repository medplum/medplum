import { WithId } from '@medplum/core';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config/types';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { globalLogger } from '../logger';
import { LongJob } from './long-job';
import * as dataMigrations from '../migrations/data';
import { PostDeployMigration, PostDeployMigrationResult } from '../migrations/data';

/*
 * The post-deploy migration worker runs a post-deploy migration.
 */

export type PostDeployMigrationJobData = {
  readonly asyncJob: WithId<AsyncJob>;
  readonly results: PostDeployMigrationResult[];
  readonly requestId?: string;
  readonly traceId?: string;
};

const queueName = 'PostDeployMigrationQueue';
const jobName = 'PostDeployMigrationJobData';
let queue: Queue<PostDeployMigrationJobData> | undefined = undefined;
let worker: Worker<PostDeployMigrationJobData> | undefined = undefined;

export function initPostDeployMigrationWorker(config: MedplumServerConfig): void {
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

  worker = new Worker<PostDeployMigrationJobData>(
    queueName,
    (job) =>
      tryRunInRequestContext(job.data.requestId, job.data.traceId, () => new PostDeployMigrationJob().execute(job)),
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

export class PostDeployMigrationJob extends LongJob<PostDeployMigrationResult, PostDeployMigrationJobData> {
  async process(_job: Job<PostDeployMigrationJobData>): Promise<PostDeployMigrationResult> {
    const dataMigrationNumber = _job.data.asyncJob.dataVersion;
    if (!dataMigrationNumber) {
      throw new Error('No data migration number found in AsyncJob');
    }
    const dataMigration = (dataMigrations as Record<string, dataMigrations.Migration>)['v' + dataMigrationNumber];
    if (!dataMigration) {
      throw new Error(`No data migration found for version ${dataMigrationNumber}`);
    }

    if (!('processPostDeploy' in dataMigration)) {
      throw new Error(`No processPostDeploy function defined for data migration ${dataMigrationNumber}`);
    }
    const postDeployMigration = dataMigration as PostDeployMigration;

    const result = await postDeployMigration.processPostDeploy();

    return result;
  }

  /**
   * Format the current job result status for inclusion in the AsyncJob resource.
   * @param _result - The current job iteration result.
   * @param job - The current job.
   * @returns The formatted output parameters or undefined if no update is needed.
   */
  formatResults(_result: PostDeployMigrationResult, job: Job<PostDeployMigrationJobData>): Parameters | undefined {
    return {
      resourceType: 'Parameters',
      parameter: job.data.results[0].actions.map((r) => {
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

  nextIterationData(
    _result: PostDeployMigrationResult,
    job: Job<PostDeployMigrationJobData>
  ): PostDeployMigrationJobData | boolean {
    return !Object.values(job.data.results).some((r) => 'err' in r);
  }

  enqueueJob(data: PostDeployMigrationJobData): Promise<Job<PostDeployMigrationJobData>> {
    return addPostDeployMigrationJobData(data);
  }
}

/**
 * Returns the post-deploy migration queue instance.
 * This is used by the unit tests.
 * @returns The post-deploy migration queue (if available).
 */
export function getPostDeployMigrationQueue(): Queue<PostDeployMigrationJobData> | undefined {
  return queue;
}

async function addPostDeployMigrationJobData(
  job: PostDeployMigrationJobData
): Promise<Job<PostDeployMigrationJobData>> {
  if (!queue) {
    throw new Error('Job queue not available');
  }
  return queue.add(jobName, job);
}

export async function addPostDeployMigrationJob(job: WithId<AsyncJob>): Promise<Job<PostDeployMigrationJobData>> {
  const { requestId, traceId } = getRequestContext();

  return addPostDeployMigrationJobData({
    asyncJob: job,
    results: [],
    requestId,
    traceId,
  });
}
