// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob, Reference, ResourceType } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getAuthenticatedContext, runInAuthenticatedContext } from '../context';
import { setResourceAccounts } from '../fhir/operations/set-accounts';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getShardSystemRepo } from '../fhir/repo';
import { TODO_SHARD_ID } from '../fhir/sharding';
import type { AuthState } from '../oauth/middleware';
import type { AsyncJobTracking } from './base';
import { getTrackingAsyncJobExecutor } from './repository';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import {
  addVerboseQueueLogging,
  defaultQueueOptions,
  getWorkerBullmqConfig,
  isJobActive,
  queueRegistry,
  trackJobMetrics,
} from './utils';

/*
 * The set-accounts worker asynchronously updates all account references
 * in a Patient compartment, decoupled from an individual HTTP request.
 */

export type SetAccountsJobData = {
  readonly resourceType: ResourceType;
  readonly id: string;
  readonly accounts: Reference[];
  readonly authState: Readonly<AuthState>;
  readonly requestId?: string;
  readonly traceId?: string;
} & (NewSetAccountsJobData | LegacySetAccountsJobData);

interface NewSetAccountsJobData {
  readonly tracking: AsyncJobTracking;
}
// PENDING{v5.2+} remove LegacySetAccountsJobData and switch SetAccountsJobData back to interface
interface LegacySetAccountsJobData {
  readonly asyncJob: WithId<AsyncJob>;
}

const queueName = 'SetAccountsQueue';
const jobName = 'SetAccountsJobData';

export const initSetAccountsWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  const queueOptions = defaultQueueOptions(config);
  const queue = new Queue<SetAccountsJobData>(queueName, queueOptions);

  let worker: Worker<SetAccountsJobData> | undefined;
  if (options?.workerEnabled !== false) {
    worker = new Worker<SetAccountsJobData>(
      queueName,
      trackJobMetrics('set-accounts', (job) => {
        const { authState, requestId, traceId } = job.data;
        return runInAuthenticatedContext(authState, requestId, traceId, { async: true }, () => execSetAccountsJob(job));
      }),
      getWorkerBullmqConfig(config, 'set-accounts', queueOptions)
    );
    addVerboseQueueLogging<SetAccountsJobData>(queue, worker, (job) => {
      if ('asyncJob' in job.data) {
        return { asyncJob: 'AsyncJob/' + job.data.asyncJob.id };
      }
      return { asyncJob: 'AyncJob/' + job.data.tracking.asyncJobId };
    });

    worker.on('failed', async (job) => {
      if (!job) {
        return;
      }

      // Mark AsyncJob as failed
      let exec: AsyncJobExecutor;
      if ('tracking' in job.data) {
        exec = await getTrackingAsyncJobExecutor(job.data.tracking);
      } else {
        // PENDING{v5.2+} remove else branch
        exec = new AsyncJobExecutor(getShardSystemRepo(TODO_SHARD_ID), job.data.asyncJob);
      }
      await exec.failJob();
    });
  }

  return { queue, worker, name: queueName };
};

/**
 * Returns the batch queue instance.
 * This is used by the unit tests.
 * @returns The batch queue (if available).
 */
export function getSetAccountsQueue(): Queue<SetAccountsJobData> | undefined {
  return queueRegistry.get(queueName);
}

/**
 * Adds a batch job to the queue.
 * @param job - The batch job details.
 * @returns The enqueued job.
 */
export async function addSetAccountsJobData(job: SetAccountsJobData): Promise<Job<SetAccountsJobData>> {
  const queue = queueRegistry.get<SetAccountsJobData>(queueName);
  if (!queue) {
    throw new Error(`Job queue ${queueName} not available`);
  }
  return queue.add(jobName, job);
}

export async function execSetAccountsJob(job: Job<SetAccountsJobData>): Promise<void> {
  const { repo } = getAuthenticatedContext();
  const { resourceType, id, accounts } = job.data;

  let exec: AsyncJobExecutor;
  if ('tracking' in job.data) {
    exec = await getTrackingAsyncJobExecutor(job.data.tracking);
  } else {
    // PENDING{v5.2+} remove else branch
    exec = new AsyncJobExecutor(getShardSystemRepo(TODO_SHARD_ID), job.data.asyncJob);
  }

  if (!isJobActive(exec.getAsyncJob())) {
    return;
  }

  await exec.startAsync(async () => {
    return setResourceAccounts(repo, resourceType, id, { accounts, propagate: true }, exec.getAsyncJob().id);
  });
}
