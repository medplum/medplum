import { Operator, SearchRequest, normalizeErrorString, parseSearchRequest } from '@medplum/core';
import { AsyncJob, Parameters, ParametersParameter, Resource, ResourceType } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { MedplumServerConfig } from '../config';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { getSystemRepo } from '../fhir/repo';
import { getLogger, globalLogger } from '../logger';
import { LongJob } from './long-job';

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
      attempts: 1,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  worker = new Worker<ReindexJobData>(
    queueName,
    (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => new ReindexJob().execute(job)),
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

export class ReindexJob extends LongJob<ReindexResult, ReindexJobData> {
  async process(job: Job<ReindexJobData>): Promise<ReindexResult> {
    const result = await processPage(job);

    const resourceType = job.data.resourceTypes[0];
    job.data.results[resourceType] = result;

    return result;
  }

  /**
   * Format the current job result status for inclusion in the AsyncJob resource.
   * @param result - The current job iteration result.
   * @param job - The current job.
   * @returns The formatted output parameters.
   */
  formatResults(result: ReindexResult, job: Job<ReindexJobData>): Parameters | undefined {
    if (isResultInProgress(result)) {
      // Skip update for most in-progress results
      if (!shouldLogProgress(result)) {
        return undefined;
      }

      // Log periodic progress updates for the job
      globalLogger.info('Reindex in progress', {
        resourceType: job.data.resourceTypes[0],
        latestJobId: job.id,
        cursor: result.cursor,
        currentCount: result.count,
        elapsedTime: `${Date.now() - job.data.startTime} ms`,
      });
    }

    // Current result either completes a resource type, or should be recorded as an in-progress update
    // These should be recorded in the AsyncJob resource for visibility
    return formatResults(job.data.results);
  }

  nextIterationData(result: ReindexResult, job: Job<ReindexJobData>): ReindexJobData | boolean {
    const asyncJob = job.data.asyncJob;
    let resourceTypes = job.data.resourceTypes;
    if (isResultComplete(result)) {
      resourceTypes = resourceTypes.slice(1);
    }

    if (isResultInProgress(result)) {
      // Enqueue job to handle next page of the current resource type
      return {
        ...job.data,
        asyncJob,
        count: result.count,
        cursor: result.cursor,
      };
    } else if (resourceTypes.length) {
      // Enqueue job to start reindexing the next resource type
      return {
        ...job.data,
        asyncJob,
        resourceTypes,
        count: 0,
        cursor: undefined,
        startTime: Date.now(),
      };
    } else {
      // All done!
      return !Object.values(job.data.results).some((r) => 'err' in r);
    }
  }

  enqueueJob(data: ReindexJobData): Promise<Job<ReindexJobData>> {
    return addReindexJobData(data);
  }
}

function isResultComplete(result: ReindexResult): boolean {
  return 'duration' in result || 'err' in result;
}

function isResultInProgress(
  result: ReindexResult
): result is { count: number; cursor: string; nextTimestamp: string; err: undefined } {
  return 'cursor' in result && !('err' in result);
}

function shouldLogProgress(result: ReindexResult): boolean {
  const count = result.count;
  return Math.floor(count / progressLogThreshold) !== Math.floor((count - batchSize) / progressLogThreshold);
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

/**
 * Format the current job result status for inclusion in the AsyncJob resource.
 * @param results - The current results from the job
 * @returns The formatted output parameters
 */
function formatResults(results: ReindexJobData['results']): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: Object.keys(results).map((resourceType) => formatReindexResult(results[resourceType], resourceType)),
  };
}

function formatReindexResult(result: ReindexResult, resourceType: string): ParametersParameter {
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
