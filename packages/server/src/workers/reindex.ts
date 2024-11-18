import { SearchRequest, Operator, normalizeErrorString, parseSearchRequest } from '@medplum/core';
import { ResourceType, Resource, AsyncJob, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { Queue, QueueBaseOptions, Job, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config';
import { getLogger, getRequestContext, tryRunInRequestContext } from '../context';
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
  readonly cursor?: string;
  readonly endTimestamp: string;
  readonly startTime: number;
  readonly count?: number;
  readonly searchFilter?: SearchRequest;
  readonly results: Record<string, ReindexResult>;
  readonly requestId?: string;
  readonly traceId?: string;
};

type ReindexResult =
  | { count: number; cursor: string; nextTimestamp: string; err?: Error }
  | { count: number; duration: number };

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
  let resourceTypes = job.data.resourceTypes;
  const resourceType = job.data.resourceTypes[0];
  if (!job.data.count) {
    getLogger().info('Reindex started', { resourceType });
  }
  let asyncJob = job.data.asyncJob;

  try {
    const result = await processPage(job);
    job.data.results[resourceType] = result;

    if ('duration' in result || 'err' in result) {
      asyncJob = await updateStatus(job);
      resourceTypes = resourceTypes.slice(1);
    }

    if ('cursor' in result && !('err' in result)) {
      const count = result.count;
      // Log progress and update status in the AsyncJob resource periodically
      if (Math.floor(count / progressLogThreshold) !== Math.floor((count - batchSize) / progressLogThreshold)) {
        globalLogger.info('Reindex in progress', {
          resourceType,
          latestJobId: job.id,
          cursor: result.cursor,
          currentCount: count,
          elapsedTime: `${Date.now() - job.data.startTime} ms`,
        });
        asyncJob = await updateStatus(job);
      }

      // Enqueue job to handle next page of the current resource type
      await addReindexJobData({
        ...job.data,
        asyncJob,
        cursor: result.cursor,
        count,
      });
    } else if (resourceTypes.length) {
      // Enqueue job to start reindexing the next resource type
      await addReindexJobData({
        ...job.data,
        asyncJob,
        resourceTypes: resourceTypes,
        count: 0,
        cursor: undefined,
        startTime: Date.now(),
      });
    } else {
      await finishReindex(job, asyncJob);
    }
  } catch (err) {
    const systemRepo = getSystemRepo();
    const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
    await exec.failJob(systemRepo, err as Error);
  }
}

/**
 * Reindex one page of resources in the database, determined by the job data and search filter.
 * @param job - The current job.
 * @returns The result of reindexing the next page of results.
 */
async function processPage(job: Job<ReindexJobData>): Promise<ReindexResult> {
  const { resourceTypes, count } = job.data;
  const resourceType = resourceTypes[0];

  const searchRequest = searchRequestForNextPage(job);
  let newCount = count ?? 0;
  let cursor = '';
  let nextTimestamp = new Date(0).toISOString();
  try {
    const systemRepo = getSystemRepo();
    await systemRepo.withTransaction(async (conn) => {
      const bundle = await systemRepo.search(searchRequest);
      if (bundle.entry?.length) {
        const resources = bundle.entry.map((e) => e.resource as Resource);
        await systemRepo.reindexResources(conn, resources);
        newCount += resources.length;
        nextTimestamp = bundle.entry[bundle.entry.length - 1].resource?.meta?.lastUpdated ?? nextTimestamp;
      }

      const nextLink = bundle.link?.find((link) => link.relation === 'next');
      if (nextLink) {
        cursor = parseSearchRequest(nextLink.url).cursor ?? '';
      }
    });
  } catch (err: any) {
    return { count: newCount, cursor, nextTimestamp, err };
  }

  if (cursor) {
    return { cursor, count: newCount, nextTimestamp };
  } else if (resourceTypes.length > 1) {
    // Completed reindex for this resource type
    const elapsedTime = Date.now() - job.data.startTime;
    getLogger().info('Reindex completed', {
      resourceType,
      count: newCount,
      duration: `${elapsedTime} ms`,
    });

    return { count: newCount, duration: elapsedTime };
  } else {
    const elapsedTime = Date.now() - job.data.startTime;
    getLogger().info('Reindex completed', { resourceType, count, duration: `${elapsedTime} ms` });
    return { count: newCount, duration: elapsedTime };
  }
}

function searchRequestForNextPage(job: Job<ReindexJobData>): SearchRequest {
  const { resourceTypes, cursor, endTimestamp, searchFilter } = job.data;
  const resourceType = resourceTypes[0];
  const searchRequest: SearchRequest = {
    resourceType,
    count: batchSize,
    sortRules: [{ code: '_lastUpdated', descending: false }],
    filters: [{ code: '_lastUpdated', operator: Operator.LESS_THAN, value: endTimestamp }],
  };
  if (cursor) {
    searchRequest.cursor = cursor;
  }
  if (searchFilter?.filters) {
    searchRequest.filters?.push(...searchFilter.filters);
  }

  return searchRequest;
}

async function updateStatus(job: Job<ReindexJobData>): Promise<AsyncJob> {
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
  const output = formatResults(job.data.results);
  return (await exec.updateJobProgress(systemRepo, output)) ?? job.data.asyncJob;
}

async function finishReindex(job: Job<ReindexJobData>, asyncJob: AsyncJob): Promise<void> {
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, asyncJob);
  if (Object.values(job.data.results).some((r) => 'err' in r)) {
    await exec.failJob(systemRepo);
  } else {
    const output = formatResults(job.data.results);
    await exec.completeJob(systemRepo, output);
  }
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
      if ('err' in result && result.err) {
        // Resource types that encountered an error report the error,
        // and a timestamp to allow restarting from previous checkpoint
        const parts: ParametersParameter[] = [
          { name: 'resourceType', valueCode: resourceType },
          { name: 'error', valueString: normalizeErrorString(result.err) },
        ];
        if (result.nextTimestamp) {
          parts.push({ name: 'nextTimestamp', valueDateTime: result.nextTimestamp });
        }
        return {
          name: 'result',
          part: parts,
        };
      } else if ('cursor' in result) {
        // In-progress resource types log the next timestamp, which could be used to restart the job
        return {
          name: 'result',
          part: [
            { name: 'resourceType', valueCode: resourceType },
            { name: 'nextTimestamp', valueDateTime: result.nextTimestamp },
          ],
        };
      } else {
        // Completed resource types report the number of indexed resources and wall time for the reindex job(s)
        return {
          name: 'result',
          part: [
            { name: 'resourceType', valueCode: resourceType },
            { name: 'count', valueInteger: result.count },
            { name: 'elapsedTime', valueQuantity: { value: result.duration, code: 'ms' } },
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
  const endTimestamp = new Date(Date.now() + 1000 * 60 * 5).toISOString(); // Five minutes in the future

  return addReindexJobData({
    resourceTypes,
    endTimestamp,
    asyncJob: job,
    startTime: Date.now(),
    searchFilter,
    results: Object.create(null),
    requestId,
    traceId,
  });
}
