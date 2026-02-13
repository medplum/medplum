// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob, Reference, ResourceType } from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { getUserConfiguration } from '../auth/me';
import { runInAsyncContext } from '../context';
import { getRepoForLogin } from '../fhir/accesspolicy';
import { setResourceAccounts } from '../fhir/operations/set-accounts';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import { getSystemRepo } from '../fhir/repo';
import type { AuthState } from '../oauth/middleware';
import type { WorkerInitializer } from './utils';
import { getBullmqRedisConnectionOptions, queueRegistry } from './utils';

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

export const initSetAccountsWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: getBullmqRedisConnectionOptions(config),
  };

  const queue = new Queue<SetAccountsJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: { attempts: 1 },
  });

  const worker = new Worker<SetAccountsJobData>(
    queueName,
    (job) => {
      const { authState, requestId, traceId } = job.data;
      return runInAsyncContext(authState, requestId, traceId, () => execSetAccountsJob(job));
    },
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );

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
  const { resourceType, id, accounts } = job.data;
  const { login, project, membership } = job.data.authState;
  const systemRepo = getSystemRepo();
  const exec = new AsyncJobExecutor(systemRepo, job.data.asyncJob);

  // Prepare the original submitting user's repo
  const userConfig = await getUserConfiguration(systemRepo, project, membership);
  const repo = await getRepoForLogin({ login, project, membership, userConfig }, true);

  try {
    const result = await setResourceAccounts(repo, resourceType, id, { accounts, propagate: true });
    await exec.completeJob(repo, result);
  } catch (err) {
    await exec.failJob(repo, err as Error);
  }
}
