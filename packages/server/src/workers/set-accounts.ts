// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob, Reference, ResourceType } from '@medplum/fhirtypes';
import type { Job } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getUserConfiguration } from '../auth/me';
import { runInAuthenticatedContext } from '../context';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { setResourceAccounts } from '../fhir/operations/set-accounts';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import type { AuthState } from '../oauth/middleware';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import { addVerboseQueueLogging, defaultQueueOptions, getWorkerBullmqConfig, queueRegistry } from './utils';

/*
 * The set-accounts worker asynchronously updates all account references
 * in a Patient compartment, decoupled from an individual HTTP request.
 */

export interface SetAccountsJobData {
  readonly asyncJob: WithId<AsyncJob>;
  readonly resourceType: ResourceType;
  readonly id: string;
  readonly accounts: Reference[];
  readonly authState: Readonly<AuthState>;
  readonly requestId?: string;
  readonly traceId?: string;
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
      (job) => {
        const { authState, requestId, traceId } = job.data;
        return runInAuthenticatedContext(authState, requestId, traceId, { async: true }, () => execSetAccountsJob(job));
      },
      getWorkerBullmqConfig(config, 'set-accounts', queueOptions)
    );
    addVerboseQueueLogging<SetAccountsJobData>(queue, worker, (job) => ({
      asyncJob: 'AsyncJob/' + job.data.asyncJob.id,
    }));

    worker.on('failed', async (job) => {
      if (!job) {
        return;
      }

      // Mark AsyncJob as failed
      const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be available in job.data.authState in the future
      const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);
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
  const { resourceType, id, accounts, asyncJob } = job.data;
  const { login, project, membership } = job.data.authState;
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // job.data will eventually include shardId

  // Prepare the original submitting user's repo
  const userConfig = await getUserConfiguration(systemRepo, project, membership);
  const repo = await getRepoForLogin({ login, project, membership, userConfig }, true);

  const exec = new AsyncJobExecutor(repo, asyncJob);
  await exec.startAsync(async () => {
    return setResourceAccounts(repo, resourceType, id, { accounts, propagate: true }, asyncJob.id);
  });
}
