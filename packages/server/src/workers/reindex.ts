// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, WithId } from '@medplum/core';
import {
  getReferenceString,
  getStatus,
  normalizeErrorString,
  OperationOutcomeError,
  Operator,
  parseSearchRequest,
  sleep,
} from '@medplum/core';
import type { AsyncJob, Bundle, Parameters, ParametersParameter, Resource, ResourceType } from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getConfig } from '../config/loader';
import { tryGetRequestContext, tryRunInRequestContext } from '../context';
import { DatabaseMode, getDatabasePool, getDefaultStatementTimeout } from '../database';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import type { SystemRepository } from '../fhir/repo';
import { getShardSystemRepo } from '../fhir/repo';
import { minCursorBasedSearchPageSize } from '../fhir/search';
import { globalLogger } from '../logger';
import { getPostDeployVersion } from '../migration-sql';
import type { PostDeployJobData, PostDeployMigration } from '../migrations/data/types';
import { MigrationVersion } from '../migrations/migration-versions';
import { reconnectOnError } from '../redis';
import type { WorkerInitializer } from './utils';
import {
  addVerboseQueueLogging,
  isJobActive,
  isJobCompatible,
  moveToDelayedAndThrow,
  queueRegistry,
  updateAsyncJobOutput,
} from './utils';

/*
 * The reindex worker updates resource rows in the database,
 * recomputing all search columns and lookup table entries.
 */

export interface ReindexJobData extends PostDeployJobData {
  readonly type: 'reindex';
  readonly shardId: string;
  readonly resourceTypes: ResourceType[];
  readonly minReindexWorkerVersion?: number;
  readonly maxResourceVersion?: number;
  readonly cursor?: string;
  readonly endTimestamp: string;
  readonly startTime: number;
  readonly count?: number;
  readonly searchFilter?: SearchRequest;
  readonly results: Record<string, ReindexResult>;

  // Configurable job settings
  readonly batchSize?: number;
  readonly searchStatementTimeout?: number;
  readonly upsertStatementTimeout?: number;
  readonly delayBetweenBatches?: number;
  readonly progressLogThreshold?: number;
  readonly maxIterationAttempts?: number;
}

export type ReindexResult =
  | { count: number; cursor: string; nextTimestamp: string; err?: Error; errSearchRequest?: SearchRequest }
  | { count: number; durationMs: number };

export interface ReindexPostDeployMigration extends PostDeployMigration<ReindexJobData> {
  type: 'reindex';
}

const ReindexQueueName = 'ReindexQueue';

interface ReindexJobSettings {
  readonly batchSize: number;
  readonly progressLogThreshold: number;
  readonly searchStatementTimeout: number;
  readonly upsertStatementTimeout: number | 'DEFAULT';
  readonly delayBetweenBatches: number;
  readonly maxIterationAttempts: number;
}

const defaultSettings: ReindexJobSettings = {
  batchSize: 500,
  progressLogThreshold: 50_000,
  searchStatementTimeout: 3_600_000, // 1 hour
  upsertStatementTimeout: 'DEFAULT',
  delayBetweenBatches: 0,
  maxIterationAttempts: 3,
};

// Version that can be bumped when the worker code changes, typically for bug fixes,
// to prevent workers running older versions of the reindex worker from processing jobs
export const REINDEX_WORKER_VERSION = 2;

export const initReindexWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: { ...config.redis, reconnectOnError },
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
  const result = await new ReindexJob(getShardSystemRepo(job.data.shardId)).execute(job, job.data);
  if (result === 'ineligible') {
    await moveToDelayedAndThrow(job, 'Reindex job delayed since worker is not eligible to execute it');
  }
}

export type ReindexExecuteResult = 'finished' | 'ineligible' | 'interrupted';

export class ReindexJob {
  private readonly systemRepo: SystemRepository;
  private readonly logger = globalLogger;
  private settings: ReindexJobSettings;

  constructor(systemRepo: SystemRepository) {
    this.systemRepo = systemRepo;
    this.settings = { ...defaultSettings, upsertStatementTimeout: getDefaultStatementTimeout(getConfig()) };
  }

  private initSettings(jobData: ReindexJobData): void {
    this.settings = {
      batchSize: jobData.batchSize ?? defaultSettings.batchSize,
      progressLogThreshold: jobData.progressLogThreshold ?? defaultSettings.progressLogThreshold,
      searchStatementTimeout: jobData.searchStatementTimeout ?? defaultSettings.searchStatementTimeout,
      upsertStatementTimeout: jobData.upsertStatementTimeout ?? getDefaultStatementTimeout(getConfig()),
      delayBetweenBatches: jobData.delayBetweenBatches ?? defaultSettings.delayBetweenBatches,
      maxIterationAttempts: jobData.maxIterationAttempts ?? defaultSettings.maxIterationAttempts,
    };
  }

  private async refreshAsyncJob(asyncJobOrId: string | WithId<AsyncJob>): Promise<WithId<AsyncJob>> {
    return this.systemRepo.readResource<AsyncJob>(
      'AsyncJob',
      typeof asyncJobOrId === 'string' ? asyncJobOrId : asyncJobOrId.id
    );
  }

  private async maybeSkipJob(asyncJob: WithId<AsyncJob>): Promise<boolean> {
    const postDeployVersion = await getPostDeployVersion(getDatabasePool(DatabaseMode.WRITER, this.systemRepo.shardId));
    if (Boolean(asyncJob.dataVersion) && postDeployVersion === MigrationVersion.FIRST_BOOT) {
      this.logger.info('Skipping reindex post-deploy migration since server is in firstBoot mode', {
        asyncJob: getReferenceString(asyncJob),
        version: `v${asyncJob.dataVersion}`,
      });
      await new AsyncJobExecutor(this.systemRepo, asyncJob).completeJob({
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
    this.initSettings(inputJobData);
    const asyncJob = await this.refreshAsyncJob(inputJobData.asyncJobId);

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
      const result = await this.processIterationWithRetry(nextJobData);
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
        await new AsyncJobExecutor(this.systemRepo, asyncJob).completeJob(output);
      } else if (finishedOrNextIterationData === false) {
        await new AsyncJobExecutor(this.systemRepo, asyncJob).failJob();
      } else {
        nextJobData = finishedOrNextIterationData;
        if (this.settings.delayBetweenBatches > 0) {
          await sleep(this.settings.delayBetweenBatches);
        }
      }
    }
    return 'finished';
  }

  /**
   * Attempt processIteration up to maxIterationAttempts times before moving on or failing.
   * @param jobData - The current job data.
   * @returns The result of reindexing the next page of results.
   */
  private async processIterationWithRetry(jobData: ReindexJobData): Promise<ReindexResult> {
    const { maxIterationAttempts } = this.settings;
    for (let attempt = 1; attempt <= maxIterationAttempts; attempt++) {
      let error: unknown;
      try {
        const result = await this.processIteration(this.systemRepo, jobData);
        // Return result if successful or on the last attempt
        if (!('err' in result) || attempt === maxIterationAttempts) {
          return result;
        }
        error = result.err;
      } catch (err: unknown) {
        if (attempt === maxIterationAttempts) {
          throw err;
        }
        error = err;
      }
      this.logger.warn('Reindex iteration failed, retrying', {
        resourceType: jobData.resourceTypes[0],
        attempt,
        maxIterationAttempts,
        error: normalizeErrorString(error),
      });
    }
    throw new Error('maxIterationAttempts must be at least 1');
  }

  /**
   * Reindex one page of resources in the database, determined by the job data and search filter.
   * @param systemRepo - The system repository to use for database operations.
   * @param jobData - The current job data.
   * @returns The result of reindexing the next page of results.
   */
  async processIteration(systemRepo: SystemRepository, jobData: ReindexJobData): Promise<ReindexResult> {
    const { resourceTypes, count, maxResourceVersion } = jobData;
    const resourceType = resourceTypes[0];
    const { batchSize, searchStatementTimeout, upsertStatementTimeout } = this.settings;

    const searchRequest = searchRequestForNextPage(jobData, batchSize);
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
          await conn.query(`SELECT set_config('statement_timeout', $1, true)`, [String(searchStatementTimeout)]);
          bundle = await systemRepo.search(searchRequest, { maxResourceVersion });
        } finally {
          if (upsertStatementTimeout === 'DEFAULT') {
            await conn.query(`RESET statement_timeout`);
          } else {
            await conn.query(`SELECT set_config('statement_timeout', $1, true)`, [String(upsertStatementTimeout)]);
          }
        }
        if (bundle.entry?.length) {
          const resources = bundle.entry.map((e) => e.resource as WithId<Resource>);
          await systemRepo.reindexResources(conn, resources);
          newCount += resources.length;
          nextTimestamp = bundle.entry.at(-1)?.resource?.meta?.lastUpdated ?? nextTimestamp;
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
      this.logger.info('Reindex completed', { resourceType, count: newCount, durationMs: elapsedTime });
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
      if (!shouldLogProgress(result, this.settings.batchSize, this.settings.progressLogThreshold)) {
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
          asyncJob = await this.refreshAsyncJob(asyncJob);
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
  if (batchSize < minCursorBasedSearchPageSize) {
    throw new Error('batcheSize must be at least ' + minCursorBasedSearchPageSize);
  }

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

export interface ReindexJobOptions {
  searchFilter?: SearchRequest;
  maxResourceVersion?: number;
  batchSize?: number;
  searchStatementTimeout?: number;
  upsertStatementTimeout?: number;
  delayBetweenBatches?: number;
  progressLogThreshold?: number;
  endTimestampBufferMinutes?: number;
  maxIterationAttempts?: number;
}

export async function addReindexJob(
  shardId: string,
  resourceTypes: ResourceType[],
  asyncJob: WithId<AsyncJob>,
  options?: ReindexJobOptions
): Promise<Job<ReindexJobData>> {
  const jobData = prepareReindexJobData(shardId, resourceTypes, asyncJob.id, options);
  return addReindexJobData(jobData);
}

export function prepareReindexJobData(
  shardId: string,
  resourceTypes: ResourceType[],
  asyncJobId: string,
  options?: ReindexJobOptions
): ReindexJobData {
  const ctx = tryGetRequestContext();
  const startTime = Date.now();
  const endTimestampBufferMinutes = options?.endTimestampBufferMinutes ?? 5;
  const endTimestamp = new Date(startTime + 1000 * 60 * endTimestampBufferMinutes).toISOString();

  return {
    type: 'reindex',
    shardId,
    minReindexWorkerVersion: REINDEX_WORKER_VERSION,
    resourceTypes,
    endTimestamp,
    asyncJobId,
    startTime,
    searchFilter: options?.searchFilter,
    maxResourceVersion: options?.maxResourceVersion,
    batchSize: options?.batchSize,
    searchStatementTimeout: options?.searchStatementTimeout,
    upsertStatementTimeout: options?.upsertStatementTimeout,
    delayBetweenBatches: options?.delayBetweenBatches,
    progressLogThreshold: options?.progressLogThreshold,
    maxIterationAttempts: options?.maxIterationAttempts,
    results: Object.create(null),
    requestId: ctx?.requestId,
    traceId: ctx?.traceId,
  };
}
