/*
 * The reindex worker updates resource rows in the database,
 * recomputing all search columns and lookup table entries.
 */

import { SearchRequest, Operator } from '@medplum/core';
import { ResourceType, Resource, AsyncJob } from '@medplum/fhirtypes';
import { Queue, QueueBaseOptions, Job, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';

export type ReindexJobData = {
  readonly asyncJob: AsyncJob;
  readonly resourceType: ResourceType;
  readonly currentTimestamp: string;
  readonly endTimestamp: string;
  readonly startTime: number;
  readonly count?: number;
  readonly requestId?: string;
  readonly traceId?: string;
};

const queueName = 'ReindexQueue';
const jobName = 'ReindexJobData';
let queue: Queue<ReindexJobData> | undefined = undefined;
let worker: Worker<ReindexJobData> | undefined = undefined;

const batchSize = 500;
const progressLogThreshold = 25_000;

export function initReindexWorker(config: MedplumServerConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<ReindexJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  worker = new Worker<ReindexJobData>(
    queueName,
    (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execReindexJob(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  worker.on('completed', (job) => {
    const count = job.data.count ?? 0;
    if (Math.floor(count / progressLogThreshold) !== Math.floor((count - batchSize) / progressLogThreshold)) {
      globalLogger.info('Reindex in progress', {
        resourceType: job.data.resourceType,
        latestJobId: job.id,
        count,
        elapsedTime: `${Date.now() - job.data.startTime} ms`,
      });
    }
  });
  worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
}

/**
 * Shuts down the reindex worker.
 * Closes the BullMQ job queue.
 * Closes the BullMQ worker.
 */
export async function closeReindexWorker(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }

  if (worker) {
    await worker.close();
    worker = undefined;
  }
}

export async function execReindexJob(job: Job<ReindexJobData>): Promise<void> {
  const ctx = getRequestContext();
  const { resourceType, currentTimestamp, endTimestamp, count } = job.data;
  const systemRepo = getSystemRepo();

  if (!count) {
    ctx.logger.info('Reindex started', { resourceType });
  }

  const searchRequest: SearchRequest = {
    resourceType,
    count: batchSize,
    sortRules: [{ code: '_lastUpdated', descending: false }],
    filters: [
      {
        code: '_lastUpdated',
        operator: Operator.GREATER_THAN_OR_EQUALS,
        value: currentTimestamp,
      },
      { code: '_lastUpdated', operator: Operator.LESS_THAN, value: endTimestamp },
    ],
  };

  try {
    const { hasMore, newCount, nextTimestamp } = await systemRepo.withTransaction(async (conn) => {
      const bundle = await systemRepo.search(searchRequest);
      let newCount = count ?? 0;
      let nextTimestamp = currentTimestamp;

      if (bundle.entry?.length) {
        const resources: Resource[] = [];
        // Since the page size could be relatively large (1k+), preferring a simple for loop
        // eslint-disable-next-line @typescript-eslint/prefer-for-of
        for (let i = 0; i < bundle.entry.length; i++) {
          const resource = bundle.entry[i].resource as Resource;
          resources.push(resource);
          nextTimestamp = resource.meta?.lastUpdated as string;
        }
        await systemRepo.reindexResources(conn, ...resources);
        newCount += resources.length;
      }

      const hasMore = !!bundle.link?.find((link) => link.relation === 'next');
      return { hasMore, newCount, nextTimestamp };
    });

    if (hasMore) {
      await addReindexJobData({
        ...job.data,
        currentTimestamp: nextTimestamp,
        count: newCount,
      });
    } else {
      const elapsedTime = Date.now() - job.data.startTime;
      ctx.logger.info('Reindex completed', { resourceType, count: newCount, duration: `${elapsedTime} ms` });

      const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
      await exec.completeJob(systemRepo, {
        resourceType: 'Parameters',
        parameter: [
          { name: 'count', valueInteger: newCount },
          { name: 'elapsedTime', valueQuantity: { value: elapsedTime, code: 'ms' } },
        ],
      });
    }
  } catch (err) {
    const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
    await exec.failJob(systemRepo, err as Error);
    throw err;
  }
}

/**
 * Returns the reindex queue instance.
 * This is used by the unit tests.
 * @returns The reindex queue (if available).
 */
export function getReindexQueue(): Queue<ReindexJobData> | undefined {
  return queue;
}

async function addReindexJobData(job: ReindexJobData): Promise<Job<ReindexJobData>> {
  if (!queue) {
    throw new Error('Job queue not available');
  }
  return queue.add(jobName, job);
}

export async function addReindexJob(resourceType: ResourceType, job: AsyncJob): Promise<Job<ReindexJobData>> {
  const { requestId, traceId } = getRequestContext();
  const currentTimestamp = new Date(0).toISOString(); // Beginning of epoch time
  const endTimestamp = new Date(Date.now() + 1000 * 60 * 5).toISOString(); // Five minutes in the future

  return addReindexJobData({
    resourceType,
    currentTimestamp,
    endTimestamp,
    asyncJob: job,
    startTime: Date.now(),
    requestId,
    traceId,
  });
}
