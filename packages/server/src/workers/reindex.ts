import {
  getReferenceString,
  getStatus,
  normalizeErrorString,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  SearchRequest,
  WithId,
} from '@medplum/core';
import { AsyncJob, Parameters, ParametersParameter, Resource, ResourceType } from '@medplum/fhirtypes';
import { Job, JobsOptions, Queue, QueueBaseOptions, Worker } from 'bullmq';
import * as semver from 'semver';
import { MedplumServerConfig } from '../config/types';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo, Repository } from '../fhir/repo';
import { getLogger, globalLogger } from '../logger';
import { getServerVersion } from '../util/version';
import { InProgressAsyncJobStatuses, QueueRegistry, queueRegistry, updateAsyncJobOutput } from './utils';

/*
 * The reindex worker updates resource rows in the database,
 * recomputing all search columns and lookup table entries.
 */

export type ReindexJobData = {
  readonly type: 'reindex';
  readonly asyncJob: WithId<AsyncJob>;
  readonly resourceTypes: ResourceType[];
  readonly maxResourceVersion?: number;
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

const defaultBatchSize = 500;
const defaultProgressLogThreshold = 50_000;

export function initReindexWorker(config: MedplumServerConfig, queueRegistry: QueueRegistry): void {
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
  queueRegistry.addQueue(queueName, queue);

  worker = new Worker<ReindexJobData>(
    queueName,
    (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => new ReindexJob().execute(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  worker.on('failed', (job, err) => globalLogger.info(`Reindex worker failed job ${job?.id} with ${err}`));
  worker.on('completed', (job) => globalLogger.info(`Reindex worker completed job ${job?.id}`));
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

export class ReindexJob {
  private readonly systemRepo: Repository;
  private readonly batchSize: number;
  private readonly progressLogThreshold: number;

  constructor(systemRepo?: Repository, batchSize?: number, progressLogThreshold?: number) {
    this.systemRepo = systemRepo ?? getSystemRepo();
    this.batchSize = batchSize ?? defaultBatchSize;
    this.progressLogThreshold = progressLogThreshold ?? defaultProgressLogThreshold;
  }

  async checkJobStatus(repo: Repository, job: Job<{ asyncJob: WithId<AsyncJob> }>): Promise<boolean> {
    const asyncJob = await repo.readResource<AsyncJob>('AsyncJob', job.data.asyncJob.id);

    if (!InProgressAsyncJobStatuses.includes(asyncJob.status)) {
      return false;
    }

    job.data.asyncJob = asyncJob;
    return true;
  }

  async execute(job: Job<ReindexJobData>): Promise<void> {
    globalLogger.debug('ReindexJob.process()', {
      jobId: job?.id,
      version: job.data.asyncJob.dataVersion,
      minServerVersion: job.data.asyncJob.minServerVersion,
      serverVersion: getServerVersion(),
    });
    // When version is asserted, we should check that we are on a version greater than or equal to that version
    if (job.data.asyncJob.minServerVersion && semver.lt(getServerVersion(), job.data.asyncJob.minServerVersion)) {
      // Since we can't handle this ourselves, re-enqueue the job for another worker that can
      const queue = queueRegistry.getQueueByName(job.queueName);
      await queue?.add(job.name, job.data, job.opts);
      return;
    }

    const canStart = await this.checkJobStatus(this.systemRepo, job);
    if (!canStart) {
      // Job is not in-progress, terminate early
      return;
    }

    const systemRepo = this.systemRepo;

    while (job.data) {
      const result = await this.processIteration(systemRepo, job.data);
      const resourceType = job.data.resourceTypes[0];
      job.data.results[resourceType] = result;
      const output = this.getAsyncJobOutputFromResults(result, job);
      if (output) {
        try {
          await updateAsyncJobOutput(systemRepo, job, output);
        } catch (err) {
          if (err instanceof OperationOutcomeError && getStatus(err.outcome) === 412) {
            // Conflict: AsyncJob was updated by another party between when the job started and now!
            // Check status to see if job was cancelled
            const canContinue = await this.checkJobStatus(this.systemRepo, job);
            if (!canContinue) {
              // Job was cancelled or errored in parallel; this iteration should abort
              globalLogger.info(
                'Stopped executing ReindexJob since the AsyncJob was cancelled or errored in parallel',
                {
                  jobId: job?.id,
                  asyncJob: getReferenceString(job.data.asyncJob),
                }
              );
              return;
            }

            // NOTE: at this point `output` was NOT updated in the AsyncJob on this iteration
            // as expected. This isn't a big deal since `output` will eventually get persisted
            // on a future iteration, but perhaps there should be a retry mechanism here?
          }
          throw err;
        }
      }
      const finishedOrNextIterationData = this.nextIterationData(result, job);
      if (typeof finishedOrNextIterationData === 'boolean') {
        const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
        if (finishedOrNextIterationData) {
          await exec.completeJob(systemRepo, output);
        } else {
          await exec.failJob(systemRepo);
        }
        return;
      }

      job.data = finishedOrNextIterationData;
    }
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
   * @param job - The current job.
   * @returns The formatted output parameters.
   */
  getAsyncJobOutputFromResults(result: ReindexResult, job: Job<ReindexJobData>): Parameters | undefined {
    if (isResultInProgress(result)) {
      // Skip update for most in-progress results
      if (!shouldLogProgress(result, this.batchSize, this.progressLogThreshold)) {
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
    return {
      resourceType: 'Parameters',
      parameter: Object.keys(job.data.results).map((resourceType) =>
        formatReindexResult(job.data.results[resourceType], resourceType)
      ),
    };
  }

  nextIterationData(result: ReindexResult, job: Job<ReindexJobData>): ReindexJobData | boolean {
    let resourceTypes = job.data.resourceTypes;
    if (isResultComplete(result)) {
      resourceTypes = resourceTypes.slice(1);
    }

    if (isResultInProgress(result)) {
      // Enqueue job to handle next page of the current resource type
      return {
        ...job.data,
        count: result.count,
        cursor: result.cursor,
      };
    } else if (resourceTypes.length) {
      // Enqueue job to start reindexing the next resource type
      return {
        ...job.data,
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

async function addReindexJobData(job: ReindexJobData, options?: JobsOptions): Promise<Job<ReindexJobData>> {
  if (!queue) {
    throw new Error(`Job queue ${queueName} not available`);
  }
  return queue.add(jobName, job, options);
}

export async function addReindexJob(
  resourceTypes: ResourceType[],
  job: WithId<AsyncJob>,
  searchFilter?: SearchRequest,
  maxResourceVersion?: number,
  options?: JobsOptions
): Promise<Job<ReindexJobData>> {
  const { requestId, traceId } = getRequestContext();
  const endTimestamp = new Date(Date.now() + 1000 * 60 * 5).toISOString(); // Five minutes in the future

  return addReindexJobData(
    {
      type: 'reindex',
      resourceTypes,
      endTimestamp,
      asyncJob: job,
      startTime: Date.now(),
      searchFilter,
      maxResourceVersion,
      results: Object.create(null),
      requestId,
      traceId,
    },
    options
  );
}
