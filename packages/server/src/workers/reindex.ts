// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
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
import { AsyncJob, Bundle, Parameters, ParametersParameter, Resource, ResourceType } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import { getConfig } from '../config/loader';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { DatabaseMode, getDatabasePool, getDefaultStatementTimeout } from '../database';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo, Repository } from '../fhir/repo';
import { globalLogger } from '../logger';
import { getPostDeployVersion } from '../migration-sql';
import { PostDeployJobData, PostDeployMigration } from '../migrations/data/types';
import { MigrationVersion } from '../migrations/migration-versions';
import {
  addVerboseQueueLogging,
  isJobActive,
  isJobCompatible,
  moveToDelayedAndThrow,
  queueRegistry,
  updateAsyncJobOutput,
  WorkerInitializer,
} from './utils';

/*
 * The reindex worker updates resource rows in the database,
 * recomputing all search columns and lookup table entries.
 */

export interface ReindexJobData extends PostDeployJobData {
  readonly type: 'reindex';
  readonly resourceTypes: ResourceType[];
  readonly minReindexWorkerVersion?: number;
  readonly maxResourceVersion?: number;
  readonly cursor?: string;
  readonly endTimestamp: string;
  readonly startTime: number;
  readonly count?: number;
  readonly searchFilter?: SearchRequest;
  readonly results: Record<string, ReindexResult>;
}

export type ReindexResult =
  | { count: number; cursor: string; nextTimestamp: string; err?: Error; errSearchRequest?: SearchRequest }
  | { count: number; durationMs: number };

export interface ReindexPostDeployMigration extends PostDeployMigration<ReindexJobData> {
  type: 'reindex';
}

const ReindexQueueName = 'ReindexQueue';

const defaultBatchSize = 500;
const defaultProgressLogThreshold = 50_000;

// Version that can be bumped when the worker code changes, typically for bug fixes,
// to prevent workers running older versions of the reindex worker from processing jobs
export const REINDEX_WORKER_VERSION = 2;

export const initReindexWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  const queue = new Queue<ReindexJobData>(ReindexQueueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 1,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  const worker = new Worker<ReindexJobData>(
    ReindexQueueName,
    async (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, async () => jobProcessor(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  addVerboseQueueLogging<ReindexJobData>(queue, worker, (job) => ({
    asyncJob: 'AsyncJob/' + job.data.asyncJobId,
    jobType: job.data.type,
  }));

  return { queue, worker, name: ReindexQueueName };
};

export async function jobProcessor(job: Job<ReindexJobData>): Promise<void> {
  const result = await new ReindexJob().execute(job, job.data);
  if (result === 'ineligible') {
    await moveToDelayedAndThrow(job, 'Reindex job delayed since worker is not eligible to execute it');
  }
}

export type ReindexExecuteResult = 'finished' | 'ineligible' | 'interrupted';

export class ReindexJob {
  private readonly systemRepo: Repository;
  private readonly batchSize: number;
  private readonly progressLogThreshold: number;
  private readonly logger = globalLogger;
  private readonly defaultStatementTimeout: number | 'DEFAULT';

  constructor(systemRepo?: Repository, batchSize?: number, progressLogThreshold?: number) {
    this.systemRepo = systemRepo ?? getSystemRepo();
    this.batchSize = batchSize ?? defaultBatchSize;
    this.progressLogThreshold = progressLogThreshold ?? defaultProgressLogThreshold;
    this.defaultStatementTimeout = getDefaultStatementTimeout(getConfig());
  }

  private async refreshAsyncJob(repo: Repository, asyncJobOrId: string | WithId<AsyncJob>): Promise<WithId<AsyncJob>> {
    return repo.readResource<AsyncJob>('AsyncJob', typeof asyncJobOrId === 'string' ? asyncJobOrId : asyncJobOrId.id);
  }

  private async maybeSkipJob(asyncJob: WithId<AsyncJob>): Promise<boolean> {
    const postDeployVersion = await getPostDeployVersion(getDatabasePool(DatabaseMode.WRITER));
    if (Boolean(asyncJob.dataVersion) && postDeployVersion === MigrationVersion.FIRST_BOOT) {
      this.logger.info('Skipping reindex post-deploy migration since server is in firstBoot mode', {
        asyncJob: getReferenceString(asyncJob),
        version: `v${asyncJob.dataVersion}`,
      });
      await new AsyncJobExecutor(this.systemRepo, asyncJob).completeJob(this.systemRepo, {
        resourceType: 'Parameters',
        parameter: [{ name: 'skipped', valueString: 'In firstBoot mode' }],
      });
      return true;
    }
    return false;
  }

  private async checkForQueueClosing(
    job: Job<ReindexJobData> | undefined,
    asyncJob: WithId<AsyncJob>,
    nextJobData: ReindexJobData
  ): Promise<void> {
    if (queueRegistry.isClosing(job?.queueName ?? '')) {
      this.logger.info('Reindex job detected queue is closing', {
        queueName: job?.queueName,
        token: job?.token,
        asyncJob: getReferenceString(asyncJob),
        jobData: JSON.stringify(nextJobData),
      });

      if (job) {
        await job.updateData(nextJobData);
        await moveToDelayedAndThrow(job, 'ReindexJob delayed since queue is closing');
      }
    }
  }

  async execute(job: Job<ReindexJobData> | undefined, inputJobData: ReindexJobData): Promise<ReindexExecuteResult> {
    const asyncJob = await this.refreshAsyncJob(this.systemRepo, inputJobData.asyncJobId);

    if (inputJobData.minReindexWorkerVersion && inputJobData.minReindexWorkerVersion > REINDEX_WORKER_VERSION) {
      return 'ineligible';
    }

    if (!isJobCompatible(asyncJob)) {
      return 'ineligible';
    }

    if (!isJobActive(asyncJob)) {
      return 'interrupted';
    }

    const skipped = await this.maybeSkipJob(asyncJob);
    if (skipped) {
      return 'finished';
    }

    return this.executeMainLoop(job, asyncJob, inputJobData);
  }

  private async executeMainLoop(
    job: Job<ReindexJobData> | undefined,
    asyncJob: WithId<AsyncJob>,
    inputJobData: ReindexJobData
  ): Promise<ReindexExecuteResult> {
    let nextJobData: ReindexJobData | undefined = inputJobData;
    while (nextJobData) {
      await this.checkForQueueClosing(job, asyncJob, nextJobData);
      const result = await this.processIteration(this.systemRepo, nextJobData);
      const resourceType = nextJobData.resourceTypes[0];
      nextJobData.results[resourceType] = result;

      const output = this.getAsyncJobOutputFromIterationResults(result, nextJobData);
      const processResult = await this.processIterationOutput(asyncJob, output);
      if (typeof processResult === 'string') {
        return processResult;
      }
      asyncJob = processResult;

      const finishedOrNextIterationData = this.nextIterationData(result, nextJobData);
      nextJobData = undefined;
      if (finishedOrNextIterationData === true) {
        await new AsyncJobExecutor(this.systemRepo, asyncJob).completeJob(this.systemRepo, output);
      } else if (finishedOrNextIterationData === false) {
        await new AsyncJobExecutor(this.systemRepo, asyncJob).failJob(this.systemRepo);
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
        /*
        When a ReindexJob needs to scan a very large table for resources to reindex,
        but most/all have already been reindexed, the search will scan the most/all of table
        before finding any results with a query such as the following. Depending on factors
        such as the size of the table, the number of rows that have already been reindexed,
        and the performance of the database, this can take a long time.

        ```sql
        SELECT "Task"."id", "Task"."lastUpdated", "Task"."content"
        FROM "Task"
        WHERE (
          ("Task"."__version" <= 2 OR "Task"."__version" IS NULL)
          AND "Task"."deleted" = false
          AND "Task"."lastUpdated" < '2025-04-19'
        ORDER BY "Task"."lastUpdated" LIMIT 501
        ```
        */
        let bundle: Bundle<WithId<Resource>>;
        try {
          await conn.query(`SET statement_timeout TO 3600000`); // 1 hour
          bundle = await systemRepo.search(searchRequest, { maxResourceVersion });
        } finally {
          await conn.query(`SET statement_timeout TO ${this.defaultStatementTimeout}`);
        }
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
      return { count: newCount, cursor, nextTimestamp, err, errSearchRequest: searchRequest };
    }

    if (cursor) {
      return { cursor, count: newCount, nextTimestamp };
    } else if (resourceTypes.length > 1) {
      // Completed reindex for this resource type
      const elapsedTime = Date.now() - jobData.startTime;
      this.logger.info('Reindex completed for resourceType', {
        resourceType,
        count: newCount,
        durationMs: elapsedTime,
      });

      return { count: newCount, durationMs: elapsedTime };
    } else {
      const elapsedTime = Date.now() - jobData.startTime;
      this.logger.info('Reindex completed', { resourceType, count, durationMs: elapsedTime });
      return { count: newCount, durationMs: elapsedTime };
    }
  }

  /**
   * Format the current job result status for inclusion in the AsyncJob resource.
   * @param result - The current job iteration result.
   * @param jobData - The current job data.
   * @returns The formatted output parameters.
   */
  getAsyncJobOutputFromIterationResults(result: ReindexResult, jobData: ReindexJobData): Parameters | undefined {
    if (isResultInProgress(result)) {
      // Skip update for most in-progress results
      if (!shouldLogProgress(result, this.batchSize, this.progressLogThreshold)) {
        return undefined;
      }

      // Log periodic progress updates for the job
      this.logger.info('Reindex in progress', {
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

  async processIterationOutput(
    asyncJob: WithId<AsyncJob>,
    output: Parameters | undefined
  ): Promise<WithId<AsyncJob> | 'interrupted'> {
    if (!output) {
      return asyncJob;
    }

    let updatedAsyncJob: WithId<AsyncJob>;
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        updatedAsyncJob = await updateAsyncJobOutput(this.systemRepo, asyncJob, output);
        return updatedAsyncJob;
      } catch (err) {
        lastError = err;
        if (err instanceof OperationOutcomeError && getStatus(err.outcome) === 412) {
          // Conflict: AsyncJob was updated by another party between when the job started and now!
          asyncJob = await this.refreshAsyncJob(this.systemRepo, asyncJob);
          if (!isJobActive(asyncJob)) {
            return 'interrupted';
          }
        }
      }
    }
    throw lastError;
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
  return 'durationMs' in result || 'err' in result;
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
      { name: 'stack', valueString: result.err.stack },
    ];
    if (result.nextTimestamp) {
      parts.push({ name: 'nextTimestamp', valueDateTime: result.nextTimestamp });
    }
    if (result.errSearchRequest) {
      parts.push({ name: 'errSearchRequest', valueString: JSON.stringify(result.errSearchRequest) });
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
        { name: 'elapsedTime', valueQuantity: { value: result.durationMs, code: 'ms' } },
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
  return queueRegistry.get(ReindexQueueName);
}

async function addReindexJobData(job: ReindexJobData): Promise<Job<ReindexJobData>> {
  const queue = getReindexQueue();
  if (!queue) {
    throw new Error(`Job queue ${ReindexQueueName} not available`);
  }
  return queue.add('ReindexJobData', job);
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
    minReindexWorkerVersion: REINDEX_WORKER_VERSION,
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
