// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { capitalize, getReferenceString, normalizeErrorString, PropertyType, toTypedValue } from '@medplum/core';
import type { AsyncJob, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import type { Job, JobsOptions, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import type { PoolClient } from 'pg';
import * as semver from 'semver';
import { getRequestContext, tryRunInRequestContext } from '../context';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import type { Repository } from '../fhir/repo';
import { getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import type {
  CustomPostDeployMigrationJobData,
  DynamicPostDeployJobData,
  PostDeployJobConfig,
  PostDeployJobData,
  PostDeployJobRunResult,
  PostDeployMigration,
} from '../migrations/data/types';
import { executeMigrationActions } from '../migrations/migrate';
import {
  enforceStrictMigrationVersionChecks,
  getPostDeployManifestEntry,
  getPostDeployMigration,
  MigrationDefinitionNotFoundError,
  withLongRunningDatabaseClient,
} from '../migrations/migration-utils';
import type { MigrationAction, MigrationActionResult } from '../migrations/types';
import { getRegisteredServers } from '../server-registry';
import type { WorkerInitializer } from './utils';
import { addVerboseQueueLogging, isJobActive, isJobCompatible, moveToDelayedAndThrow, queueRegistry } from './utils';

export const PostDeployMigrationQueueName = 'PostDeployMigrationQueue';

function getJobDataLoggingFields(job: Job<PostDeployJobData>): Record<string, string> {
  return {
    shardId: job.data.shardId,
    asyncJob: 'AsyncJob/' + job.data.asyncJobId,
    jobType: job.data.type,
  };
}

export const initPostDeployMigrationWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  const queue = new Queue<PostDeployJobData>(PostDeployMigrationQueueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 1, // No retries
    },
  });

  const worker = new Worker<PostDeployJobData>(
    PostDeployMigrationQueueName,
    async (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, async () => jobProcessor(job)),
    {
      ...config.bullmq,
      ...defaultOptions,
    }
  );
  addVerboseQueueLogging<PostDeployJobData>(queue, worker, getJobDataLoggingFields);
  return { queue, worker, name: PostDeployMigrationQueueName };
};

export async function isClusterCompatible(migrationNumber: number): Promise<boolean> {
  if (!enforceStrictMigrationVersionChecks()) {
    return true;
  }

  const servers = await getRegisteredServers(true);
  const entry = getPostDeployManifestEntry(migrationNumber);
  const requiredVersion = entry.serverVersion;
  return servers.every((server) => semver.gte(server.version, requiredVersion));
}

export async function jobProcessor(job: Job<PostDeployJobData>): Promise<void> {
  const asyncJob = await getSystemRepo(undefined, job.data.shardId).readResource<AsyncJob>(
    'AsyncJob',
    job.data.asyncJobId
  );

  if (!isJobCompatible(asyncJob)) {
    await moveToDelayedAndThrow(job, 'Post-deploy migration delayed since this worker is not compatible');
  }

  if (!isJobActive(asyncJob)) {
    globalLogger.info(`${PostDeployMigrationQueueName} processor skipping job since AsyncJob is not active`, {
      jobId: job.id,
      ...getJobDataLoggingFields(job),
      asyncJobStatus: asyncJob.status,
    });
    return;
  }

  if (job.data.type === 'dynamic') {
    await runDynamicMigration(getSystemRepo(undefined, job.data.shardId), job as Job<DynamicPostDeployJobData>);
    return;
  }

  const migrationNumber = asyncJob.dataVersion;
  if (!migrationNumber) {
    throw new Error(`Post-deploy migration number (AsyncJob.dataVersion) not found in ${getReferenceString(asyncJob)}`);
  }

  let migration: PostDeployMigration;
  try {
    migration = getPostDeployMigration(migrationNumber);
  } catch (err: any) {
    if (err instanceof MigrationDefinitionNotFoundError) {
      await moveToDelayedAndThrow(
        job,
        'Post-deploy migration delayed since migration definition was not found on this worker'
      );
    }
    throw err;
  }

  if (migration.type !== job.data.type) {
    throw new Error(`Post-deploy migration ${migrationNumber} is not a ${job.data.type} migration`);
  }

  if (!(await isClusterCompatible(migrationNumber))) {
    await moveToDelayedAndThrow(
      job,
      `Post-deploy migration v${migrationNumber} delayed since the server cluster is not compatible`
    );
  }

  const result: PostDeployJobRunResult = await migration.run(getSystemRepo(undefined, job.data.shardId), job, job.data);

  switch (result) {
    case 'ineligible': {
      await moveToDelayedAndThrow(job, 'Post-deploy migration delayed since worker is not eligible to execute it');
      break;
    }
    case 'finished':
    case 'interrupted':
      break;
    default:
      result satisfies never;
      throw new Error(`Unexpected PostDeployMigration.run(${migrationNumber}) result: ${result}`);
  }
}

async function runDynamicMigration(
  repo: Repository,
  job: Job<DynamicPostDeployJobData>
): Promise<PostDeployJobRunResult> {
  const asyncJob = await repo.readResource<AsyncJob>('AsyncJob', job.data.asyncJobId);
  const exec = new AsyncJobExecutor(repo, asyncJob);
  const results: MigrationActionResult[] = [];
  try {
    await withLongRunningDatabaseClient(async (client) => {
      await executeMigrationActions(client, results, job.data.migrationActions);
    }, repo.projectShardId);
    const output = getAsyncJobOutputFromMigrationActionResults(results);
    await exec.completeJob(repo, output);
  } catch (err: any) {
    const errorMsg = normalizeErrorString(err);
    globalLogger.error('Post-deploy migration threw an error', {
      error: errorMsg,
      asyncJob: getReferenceString(asyncJob),
      type: job.data.type,
      dataVersion: asyncJob.dataVersion,
    });
    await exec.failJob(repo, err);
  }
  return 'finished';
}

export async function runCustomMigration(
  repo: Repository,
  job: Job<CustomPostDeployMigrationJobData> | undefined,
  jobData: CustomPostDeployMigrationJobData,
  callback: (
    client: PoolClient,
    results: MigrationActionResult[],
    job: Job<CustomPostDeployMigrationJobData> | undefined,
    jobData: CustomPostDeployMigrationJobData
  ) => Promise<void>
): Promise<PostDeployJobRunResult> {
  const asyncJob = await repo.readResource<AsyncJob>('AsyncJob', jobData.asyncJobId);
  const exec = new AsyncJobExecutor(repo, asyncJob);
  const results: MigrationActionResult[] = [];
  try {
    await withLongRunningDatabaseClient(async (client) => {
      await callback(client, results, job, jobData);
    }, repo.projectShardId);
    const output = getAsyncJobOutputFromMigrationActionResults(results);
    await exec.completeJob(repo, output);
  } catch (err: any) {
    const errorMsg = normalizeErrorString(err);
    globalLogger.error('Post-deploy migration threw an error', {
      error: errorMsg,
      asyncJob: getReferenceString(asyncJob),
      type: jobData.type,
      dataVersion: asyncJob.dataVersion,
    });
    const output = getAsyncJobOutputFromMigrationActionResults(results);
    await exec.failJob(repo, err, output);
  }
  return 'finished';
}

function getAsyncJobOutputFromMigrationActionResults(results: MigrationActionResult[]): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: results.map((r) => {
      const { name, durationMs, ...rest } = r;
      const part: ParametersParameter[] = [
        {
          name: 'durationMs',
          valueInteger: durationMs,
        },
      ];
      for (const [name, value] of Object.entries(rest)) {
        const typedValue = toTypedValue(value);
        if (typedValue.type === 'undefined') {
          continue;
        }
        if ([PropertyType.integer, PropertyType.decimal, PropertyType.boolean].includes(typedValue.type as any)) {
          part.push({
            name: name,
            ['value' + capitalize(typedValue.type)]: value,
          });
        } else {
          part.push({
            name: name,
            valueString: value?.toString(),
          });
        }
      }

      return {
        name,
        part,
      };
    }),
  };
}

export function prepareCustomMigrationJobData(config: PostDeployJobConfig): CustomPostDeployMigrationJobData {
  const { requestId, traceId } = getRequestContext();
  return {
    type: 'custom',
    asyncJobId: config.asyncJob.id,
    shardId: config.shardId,
    requestId,
    traceId,
  };
}

export function prepareDynamicMigrationJobData(
  config: PostDeployJobConfig,
  migrationActions: MigrationAction[]
): DynamicPostDeployJobData {
  const { requestId, traceId } = getRequestContext();
  return {
    type: 'dynamic',
    migrationActions,
    asyncJobId: config.asyncJob.id,
    shardId: config.shardId,
    requestId,
    traceId,
  };
}

export async function addPostDeployMigrationJobData<T extends PostDeployJobData>(
  jobData: T,
  options?: JobsOptions
): Promise<Job<T> | undefined> {
  const asyncJob = await getSystemRepo(undefined, jobData.shardId).readResource<AsyncJob>(
    'AsyncJob',
    jobData.asyncJobId
  );
  const deduplicationId = `${jobData.shardId}:v${asyncJob.dataVersion}`;

  const queue = queueRegistry.get<PostDeployJobData>(PostDeployMigrationQueueName);
  if (!queue) {
    throw new Error(`Job queue ${PostDeployMigrationQueueName} not available`);
  }

  const job = await queue.add('PostDeployMigrationJobData', jobData, {
    ...options,
    deduplication: { id: deduplicationId },
  });

  globalLogger.debug('Added post-deploy migration job', {
    jobId: job.id,
    ...getJobDataLoggingFields(job),
  });

  return job as Job<T>;
}
