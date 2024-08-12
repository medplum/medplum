import { SearchRequest, Operator } from '@medplum/core';
import { ResourceType, Resource, AsyncJob, Parameters } from '@medplum/fhirtypes';
import { Queue, QueueBaseOptions, Job, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';

/*
 * The reindex worker updates resource rows in the database,
 * recomputing all search columns and lookup table entries.
 */

export type ReindexJobData = {
  readonly asyncJob: AsyncJob;
  readonly resourceTypes: ResourceType[];
  readonly currentTimestamp: string;
  readonly endTimestamp: string;
  readonly startTime: number;
  readonly count?: number;
  readonly searchFilter?: SearchRequest;
  readonly results: Record<string, string | [number, number]>;
  readonly requestId?: string;
  readonly traceId?: string;
};

const queueName = 'ReindexQueue';
const jobName = 'ReindexJobData';
let queue: Queue<ReindexJobData> | undefined = undefined;
let worker: Worker<ReindexJobData> | undefined = undefined;

const batchSize = 500;
const progressLogThreshold = 50_000;

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
  worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
}

/**
 * Shuts down the reindex worker.
 * Closes the BullMQ job queue.
 * Closes the BullMQ worker.
 */
export async function closeReindexWorker(): Promise<void> {
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

export async function execReindexJob(job: Job<ReindexJobData>): Promise<void> {
  const ctx = getRequestContext();
  const { resourceTypes, currentTimestamp, endTimestamp, count, searchFilter } = job.data;
  const resourceType = resourceTypes[0];

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
  if (searchFilter?.filters) {
    searchRequest.filters?.push(...searchFilter.filters);
  }

  try {
    await processPage(searchRequest, job);
  } catch (err) {
    const systemRepo = getSystemRepo();
    const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
    await exec.failJob(systemRepo, err as Error);
  }
}

/**
 * Reindex one page of resources in the database, determined by the job data and search filter.
 * @param searchRequest - The search filter to find resources to reindex.
 * @param job - The current job.
 */
async function processPage(searchRequest: SearchRequest, job: Job<ReindexJobData>): Promise<void> {
  const { resourceTypes, currentTimestamp, count } = job.data;
  const systemRepo = getSystemRepo();
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

    const hasMore = bundle.link?.some((link) => link.relation === 'next') ?? false;
    return { hasMore, newCount, nextTimestamp };
  });

  const resourceType = resourceTypes[0];
  if (hasMore) {
    job.data.results[resourceType] = nextTimestamp;

    // Log progress and update status in the AsyncJob resource periodically
    if (Math.floor(newCount / progressLogThreshold) !== Math.floor((newCount - batchSize) / progressLogThreshold)) {
      globalLogger.info('Reindex in progress', {
        resourceType,
        latestJobId: job.id,
        nextTimestamp,
        count,
        elapsedTime: `${Date.now() - job.data.startTime} ms`,
      });
      await updateStatus(job);
    }

    // Enqueue job to handle next page of the current resource type
    await addReindexJobData({
      ...job.data,
      currentTimestamp: nextTimestamp,
      count: newCount,
    });
  } else if (resourceTypes.length > 1) {
    // Completed reindex for this resource type
    const elapsedTime = Date.now() - job.data.startTime;
    getRequestContext().logger.info('Reindex completed', {
      resourceType,
      count: newCount,
      duration: `${elapsedTime} ms`,
    });

    job.data.results[resourceType] = [newCount, elapsedTime];
    await updateStatus(job);

    // Enqueue job to start reindexing the next resource type
    await addReindexJobData({
      ...job.data,
      resourceTypes: resourceTypes.slice(1),
      currentTimestamp: new Date(0).toISOString(),
      count: 0,
      startTime: Date.now(),
    });
  } else {
    await finishReindex(job, newCount);
  }
}

async function updateStatus(job: Job<ReindexJobData>): Promise<void> {
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
  await exec.updateJobProgress(systemRepo, formatResults(job.data.results));
}

async function finishReindex(job: Job<ReindexJobData>, count: number): Promise<void> {
  const ctx = getRequestContext();
  const resourceType = job.data.resourceTypes[0];
  const elapsedTime = Date.now() - job.data.startTime;

  ctx.logger.info('Reindex completed', { resourceType, count, duration: `${elapsedTime} ms` });
  job.data.results[resourceType] = [count, elapsedTime];

  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
  await exec.completeJob(systemRepo, formatResults(job.data.results));
}

/**
 * Format the current job result status for inclusion in the AsyncJob resource.
 * @param results - The current results from the job
 * @returns The formatted output parameters
 */
function formatResults(results: ReindexJobData['results']): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: Object.keys(results).map((resourceType) => {
      const result = results[resourceType];
      if (typeof result === 'string') {
        // In-progress resource types log the next timestamp, which could be used to restart the job
        return {
          name: 'result',
          part: [
            { name: 'resourceType', valueCode: resourceType },
            { name: 'nextTimestamp', valueDateTime: result },
          ],
        };
      } else {
        // Completed resource types report the number of indexed resources and wall time for the reindex job(s)
        const [count, elapsedTime] = result;
        return {
          name: 'result',
          part: [
            { name: 'resourceType', valueCode: resourceType },
            { name: 'count', valueInteger: count },
            { name: 'elapsedTime', valueQuantity: { value: elapsedTime, code: 'ms' } },
          ],
        };
      }
    }),
  };
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

export async function addReindexJob(
  resourceTypes: ResourceType[],
  job: AsyncJob,
  searchFilter?: SearchRequest
): Promise<Job<ReindexJobData>> {
  const { requestId, traceId } = getRequestContext();
  const currentTimestamp = new Date(0).toISOString(); // Beginning of epoch time
  const endTimestamp = new Date(Date.now() + 1000 * 60 * 5).toISOString(); // Five minutes in the future

  return addReindexJobData({
    resourceTypes,
    currentTimestamp,
    endTimestamp,
    asyncJob: job,
    startTime: Date.now(),
    searchFilter,
    results: Object.create(null),
    requestId,
    traceId,
  });
}
