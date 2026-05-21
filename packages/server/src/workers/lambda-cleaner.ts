// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { LambdaClient } from '@aws-sdk/client-lambda';
import { ListFunctionsCommand } from '@aws-sdk/client-lambda';
import type { WithId } from '@medplum/core';
import { EMPTY } from '@medplum/core';
import type { AsyncJob, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import type { DeleteLambdaVersionOptions, DeleteOldLambdaVersionStats } from '../cloud/aws/lambda';
import {
  DeleteLambdaVersionOptionsDefaults,
  deleteOldLambdaVersions,
  getBotManagementLambdaClient,
} from '../cloud/aws/lambda';
import { tryRunInRequestContext } from '../context';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { globalLogger } from '../logger';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import { addVerboseQueueLogging, getBullmqRedisConnectionOptions, getWorkerBullmqConfig, queueRegistry } from './utils';

export interface LambdaCleanerOptions {
  readonly nameRegex: string;
  readonly keepLatest?: number;
  readonly deleteConcurrency?: number;
  readonly dryRun?: boolean;
}

interface ResolvedLambdaCleanerOptions extends LambdaCleanerOptions, DeleteLambdaVersionOptions {
  readonly dryRun: boolean;
}

export interface LambdaCleanerJobData {
  readonly asyncJob: WithId<AsyncJob>;
  readonly options: LambdaCleanerOptions;
  readonly requestId?: string;
  readonly traceId?: string;
}

export interface LambdaCleanerSummary extends DeleteOldLambdaVersionStats {
  readonly options: ResolvedLambdaCleanerOptions;
  functionsScanned: number;
  functionsMatched: number;
  durationMs: number;
}

export const LambdaCleanerQueueName = 'LambdaCleanerQueue';

export const initLambdaCleanerWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  const defaultOptions: QueueBaseOptions = {
    connection: getBullmqRedisConnectionOptions(config),
  };

  const queue = new Queue<LambdaCleanerJobData>(LambdaCleanerQueueName, {
    ...defaultOptions,
    defaultJobOptions: { attempts: 1 },
  });

  let worker: Worker<LambdaCleanerJobData> | undefined;
  if (options?.workerEnabled !== false) {
    const workerConfig = getWorkerBullmqConfig(config, 'lambda-cleaner');
    worker = new Worker<LambdaCleanerJobData>(
      LambdaCleanerQueueName,
      (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => lambdaCleanerJobProcessor(job)),
      { ...defaultOptions, concurrency: 1, ...workerConfig }
    );
    addVerboseQueueLogging<LambdaCleanerJobData>(queue, worker, (job) => ({
      asyncJob: `AsyncJob/${job.data.asyncJob.id}`,
      nameRegex: job.data.options.nameRegex,
      dryRun: job.data.options.dryRun,
    }));
  }

  return { queue, worker, name: LambdaCleanerQueueName };
};

export function getLambdaCleanerQueue(): Queue<LambdaCleanerJobData> | undefined {
  return queueRegistry.get(LambdaCleanerQueueName);
}

export async function addLambdaCleanerJobData(jobData: LambdaCleanerJobData): Promise<Job<LambdaCleanerJobData>> {
  const queue = getLambdaCleanerQueue();
  if (!queue) {
    throw new Error(`Job queue ${LambdaCleanerQueueName} not available`);
  }
  return queue.add('LambdaCleanerJob', jobData);
}

export async function lambdaCleanerJobProcessor(job: Job<LambdaCleanerJobData>): Promise<WithId<AsyncJob>> {
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID);
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
  return exec.startAsync(async () => {
    const summary = await execLambdaCleanerJob(job.data.options);
    return formatSummary(summary);
  });
}

export async function execLambdaCleanerJob(
  inputOptions: LambdaCleanerOptions,
  client?: LambdaClient
): Promise<LambdaCleanerSummary> {
  const options: ResolvedLambdaCleanerOptions = {
    ...inputOptions,
    keepLatest: inputOptions.keepLatest ?? DeleteLambdaVersionOptionsDefaults.keepLatest,
    deleteConcurrency: inputOptions.deleteConcurrency ?? DeleteLambdaVersionOptionsDefaults.deleteConcurrency,
    dryRun: inputOptions.dryRun ?? true,
  };
  const lambdaClient = client ?? getBotManagementLambdaClient();
  const startTime = Date.now();
  const summary: LambdaCleanerSummary = {
    options,
    functionsScanned: 0,
    functionsMatched: 0,
    functionsWithDeleteCandidates: 0,
    publishedVersionsScanned: 0,
    versionsPlanned: 0,
    versionsDeleted: 0,
    versionsNotFound: 0,
    versionsHasAlias: 0,
    durationMs: 0,
  };

  const nameRegex = new RegExp(options.nameRegex);
  let marker: string | undefined;
  do {
    const response = await lambdaClient.send(new ListFunctionsCommand({ Marker: marker }));
    marker = response.NextMarker;

    for (const lambdaFunction of response.Functions ?? EMPTY) {
      const functionName = lambdaFunction.FunctionName;
      if (functionName) {
        summary.functionsScanned++;
        if (nameRegex.test(functionName)) {
          summary.functionsMatched++;
          await deleteOldLambdaVersions(lambdaClient, functionName, options, summary);
        }
      }
    }
  } while (marker);

  summary.durationMs = Date.now() - startTime;
  globalLogger.info('Lambda cleaner completed', summary);
  return summary;
}

function formatSummary(summary: LambdaCleanerSummary): Parameters {
  const { options, ...stats } = summary;
  const parameters: ParametersParameter[] = [
    { name: 'options.nameRegex', valueString: options.nameRegex },
    { name: 'options.keepLatest', valueInteger: options.keepLatest },
    { name: 'options.deleteConcurrency', valueInteger: options.deleteConcurrency },
    { name: 'options.dryRun', valueBoolean: options.dryRun },
    { name: 'functionsScanned', valueInteger: stats.functionsScanned },
    { name: 'functionsMatched', valueInteger: stats.functionsMatched },
    { name: 'functionsWithDeleteCandidates', valueInteger: stats.functionsWithDeleteCandidates },
    { name: 'publishedVersionsScanned', valueInteger: stats.publishedVersionsScanned },
    { name: 'versionsPlanned', valueInteger: stats.versionsPlanned },
    { name: 'versionsDeleted', valueInteger: stats.versionsDeleted },
    { name: 'versionsNotFound', valueInteger: stats.versionsNotFound },
    { name: 'versionsHasAlias', valueInteger: stats.versionsHasAlias },
    { name: 'durationMs', valueQuantity: { value: stats.durationMs, code: 'ms' } },
  ];

  return {
    resourceType: 'Parameters',
    parameter: parameters,
  };
}
