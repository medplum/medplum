import {
  getStatus,
  normalizeErrorString,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  SearchRequest,
  WithId,
} from '@medplum/core';
import { AsyncJob, Parameters, ParametersParameter, Resource, ResourceType } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import * as semver from 'semver';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo, Repository } from '../fhir/repo';
import { getLogger, globalLogger } from '../logger';
import { PostDeployJobData, PostDeployMigration } from '../migrations/data/types';
import { getServerVersion } from '../util/version';
import { shouldContinueJob, updateAsyncJobOutput, WorkerInitializer, queueRegistry } from './utils';

/*
 * The reindex worker updates resource rows in the database,
 * recomputing all search columns and lookup table entries.
 */

export interface ReindexJobData extends PostDeployJobData {
  readonly type: 'reindex';
  readonly resourceTypes: ResourceType[];
  readonly maxResourceVersion?: number;
  readonly cursor?: string;
  readonly endTimestamp: string;
  readonly startTime: number;
  readonly count?: number;
  readonly searchFilter?: SearchRequest;
  readonly results: Record<string, ReindexResult>;
}

export type ReindexResult =
  | { count: number; cursor: string; nextTimestamp: string; err?: Error }
  | { count: number; duration: number };

export interface ReindexPostDeployMigration extends PostDeployMigration<ReindexJobData> {
  type: 'reindex';
}

const queueName = 'ReindexQueue';
const jobName = 'ReindexJobData';
let queue: Queue<ReindexJobData> | undefined = undefined;
let worker: Worker<ReindexJobData> | undefined = undefined;

const defaultBatchSize = 500;
const defaultProgressLogThreshold = 50_000;

export const initReindexWorker: WorkerInitializer = (config) => {
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
    (job) =>
      tryRunInRequestContext(job.data.requestId, job.data.traceId, async () => {
        const result = await new ReindexJob().execute(job.data);
        if (result === 'ineligible') {
          // Since we can't handle this ourselves, re-enqueue the job for another worker that can
          const queue = queueRegistry.getQueue(job.queueName);
          await queue?.add(job.name, job.data, job.opts);
        }
      }),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  worker.on('failed', (job, err) => globalLogger.info(`Reindex worker failed job ${job?.id} with ${err}`));
  worker.on('completed', (job) => globalLogger.info(`Reindex worker completed job ${job?.id}`));

  return { queue, name: queueName };
};

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

export class ReindexJob {
  private readonly systemRepo: Repository;
  private readonly batchSize: number;
  private readonly progressLogThreshold: number;

  constructor(systemRepo?: Repository, batchSize?: number, progressLogThreshold?: number) {
    this.systemRepo = systemRepo ?? getSystemRepo();
    this.batchSize = batchSize ?? defaultBatchSize;
    this.progressLogThreshold = progressLogThreshold ?? defaultProgressLogThreshold;
  }

  private async refreshAsyncJob(repo: Repository, asyncJobOrId: string | WithId<AsyncJob>): Promise<WithId<AsyncJob>> {
    return repo.readResource<AsyncJob>('AsyncJob', typeof asyncJobOrId === 'string' ? asyncJobOrId : asyncJobOrId.id);
  }

  async execute(inputJobData: ReindexJobData): Promise<'finished' | 'ineligible' | 'interrupted'> {
    let asyncJob = await this.refreshAsyncJob(this.systemRepo, inputJobData.asyncJobId);

    if (asyncJob.minServerVersion && semver.lt(getServerVersion(), asyncJob.minServerVersion)) {
      // Since we can't handle this ourselves, re-enqueue the job for another worker that can
      return 'ineligible';
    }

    if (!shouldContinueJob(asyncJob)) {
      return 'interrupted';
    }

    const systemRepo = this.systemRepo;

    let nextJobData: ReindexJobData | undefined = inputJobData;
    while (nextJobData) {
      const result = await this.processIteration(systemRepo, nextJobData);
      const resourceType = nextJobData.resourceTypes[0];
      nextJobData.results[resourceType] = result;

      const output = this.getAsyncJobOutputFromResults(result, nextJobData);
      if (output) {
        try {
          asyncJob = await updateAsyncJobOutput(systemRepo, asyncJob, output);
        } catch (err) {
          if (err instanceof OperationOutcomeError && getStatus(err.outcome) === 412) {
            // Conflict: AsyncJob was updated by another party between when the job started and now!
            asyncJob = await this.refreshAsyncJob(systemRepo, asyncJob);
            if (!shouldContinueJob(asyncJob)) {
              return 'interrupted';
            }

            // NOTE: at this point `output` was NOT updated in the AsyncJob on this iteration
            // as expected. This isn't a big deal since `output` will eventually get persisted
            // on a future iteration, but perhaps there should be a retry mechanism here?
          }
          throw err;
        }
      }

      const finishedOrNextIterationData = this.nextIterationData(result, nextJobData);
      if (typeof finishedOrNextIterationData === 'boolean') {
        const exec = new AsyncJobExecutor(systemRepo, asyncJob);
        if (finishedOrNextIterationData) {
          await exec.completeJob(systemRepo, output);
        } else {
          await exec.failJob(systemRepo);
        }
        nextJobData = undefined;
      } else {
        nextJobData = finishedOrNextIterationData;
      }
    }
    return 'finished';
  }

  /**
   * Reindex one page of resources in the database, determined by the job data and search filter.
   * @param systemRepo - The system repository to use for database operations.
   * @param jobData - The current job data.
   * @returns The result of reindexing the next page of results.
   */
  async processIteration(systemRepo: Repository, jobData: ReindexJobData): Promise<ReindexResult> {
    const { resourceTypes, count, maxResourceVersion } = jobData;
    const resourceType = resourceTypes[0];

    const searchRequest = searchRequestForNextPage(jobData, this.batchSize);
    let newCount = count ?? 0;
    let cursor = '';
    let nextTimestamp = new Date(0).toISOString();
    try {
      await systemRepo.withTransaction(async (conn) => {
        const bundle = await systemRepo.search(searchRequest, { maxResourceVersion });
        if (bundle.entry?.length) {
          const resources = bundle.entry.map((e) => e.resource as WithId<Resource>);
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
      const elapsedTime = Date.now() - jobData.startTime;
      getLogger().info('Reindex completed', {
        resourceType,
        count: newCount,
        duration: `${elapsedTime} ms`,
      });

      return { count: newCount, duration: elapsedTime };
    } else {
      const elapsedTime = Date.now() - jobData.startTime;
      getLogger().info('Reindex completed', { resourceType, count, duration: `${elapsedTime} ms` });
      return { count: newCount, duration: elapsedTime };
    }
  }

  /**
   * Format the current job result status for inclusion in the AsyncJob resource.
   * @param result - The current job iteration result.
   * @param jobData - The current job data.
   * @returns The formatted output parameters.
   */
  getAsyncJobOutputFromResults(result: ReindexResult, jobData: ReindexJobData): Parameters | undefined {
    if (isResultInProgress(result)) {
      // Skip update for most in-progress results
      if (!shouldLogProgress(result, this.batchSize, this.progressLogThreshold)) {
        return undefined;
      }

      // Log periodic progress updates for the job
      globalLogger.info('Reindex in progress', {
        resourceType: jobData.resourceTypes[0],
        cursor: result.cursor,
        currentCount: result.count,
        elapsedTime: `${Date.now() - jobData.startTime} ms`,
      });
    }

    // Current result either completes a resource type, or should be recorded as an in-progress update
    // These should be recorded in the AsyncJob resource for visibility
    return {
      resourceType: 'Parameters',
      parameter: Object.keys(jobData.results).map((resourceType) =>
        formatReindexResult(jobData.results[resourceType], resourceType)
      ),
    };
  }

  nextIterationData(result: ReindexResult, jobData: ReindexJobData): ReindexJobData | boolean {
    let resourceTypes = jobData.resourceTypes;
    if (isResultComplete(result)) {
      resourceTypes = resourceTypes.slice(1);
    }

    if (isResultInProgress(result)) {
      // Enqueue job to handle next page of the current resource type
      return {
        ...jobData,
        count: result.count,
        cursor: result.cursor,
      };
    } else if (resourceTypes.length) {
      // Enqueue job to start reindexing the next resource type
      return {
        ...jobData,
        resourceTypes,
        count: 0,
        cursor: undefined,
        startTime: Date.now(),
      };
    } else {
      // All done!
      return !Object.values(jobData.results).some((r) => 'err' in r);
    }
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

function shouldLogProgress(result: ReindexResult, batchSize: number, progressLogThreshold: number): boolean {
  const count = result.count;
  return Math.floor(count / progressLogThreshold) !== Math.floor((count - batchSize) / progressLogThreshold);
}

function searchRequestForNextPage(jobData: ReindexJobData, batchSize: number): SearchRequest {
  const { resourceTypes, cursor, endTimestamp, searchFilter } = jobData;
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
    throw new Error(`Job queue ${queueName} not available`);
  }
  return queue.add(jobName, job);
}

export async function addReindexJob(
  resourceTypes: ResourceType[],
  asyncJob: WithId<AsyncJob>,
  searchFilter?: SearchRequest,
  maxResourceVersion?: number
): Promise<Job<ReindexJobData>> {
  const jobData = prepareReindexJobData(resourceTypes, asyncJob.id, searchFilter, maxResourceVersion);
  return addReindexJobData(jobData);
}

export function prepareReindexJobData(
  resourceTypes: ResourceType[],
  asyncJobId: string,
  searchFilter?: SearchRequest,
  maxResourceVersion?: number
): ReindexJobData {
  const { requestId, traceId } = getRequestContext();
  const startTime = Date.now();
  const endTimestamp = new Date(startTime + 1000 * 60 * 5).toISOString(); // Five minutes in the future

  return {
    type: 'reindex',
    resourceTypes,
    endTimestamp,
    asyncJobId,
    startTime,
    searchFilter,
    maxResourceVersion,
    results: Object.create(null),
    requestId,
    traceId,
  };
}
