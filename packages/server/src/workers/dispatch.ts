// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ResourceNotFoundException } from '@aws-sdk/client-lambda';
import type { BackgroundJobContext, BackgroundJobInteraction, WithId } from '@medplum/core';
import type { Project, Resource, ResourceType } from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { deleteLambda, getLambdaNameForBot } from '../cloud/aws/deploy';
import { getBotManagementLambdaClient } from '../cloud/aws/lambda';
import { tryGetRequestContext, tryRunInRequestContext } from '../context';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { getLogger } from '../logger';
import { addCronJobs } from './cron';
import { addDownloadJobs } from './download';
import { addSubscriptionJobs } from './subscription';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import { getBullmqRedisConnectionOptions, getWorkerBullmqConfig, queueRegistry } from './utils';

/*
 * The dispatch worker dispatches resource changes to other async jobs.
 *
 * Historically, this work was performed synchronously as part of the main request processing pipeline.
 * However, this caused performance issues under load, and also made it difficult to retry failed dispatches.
 *
 * This change also enables moving all of this work outside of HTTP server hosts, and on to dedicated worker hosts.
 */

export interface DispatchJobData {
  readonly interaction: BackgroundJobInteraction;
  readonly resourceType: ResourceType;
  readonly id: string;
  readonly versionId: string;
  readonly previousVersionId?: string;
  readonly requestId?: string;
  readonly traceId?: string;
}

const queueName = 'DispatchQueue';
const jobName = 'DispatchJobData';

export const initDispatchWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  const defaultOptions: QueueBaseOptions = {
    connection: getBullmqRedisConnectionOptions(config),
  };

  const queue = new Queue<DispatchJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  let worker: Worker<DispatchJobData> | undefined;
  if (options?.workerEnabled !== false) {
    const workerBullmq = getWorkerBullmqConfig(config, 'dispatch');
    worker = new Worker<DispatchJobData>(
      queueName,
      (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execDispatchJob(job)),
      {
        ...defaultOptions,
        ...workerBullmq,
      }
    );
  }

  return { queue, worker, name: queueName };
};

/**
 * Returns the dispatch queue instance.
 * This is used by the unit tests.
 *
 * @returns The dispatch queue.
 * @throws Error if the dispatch queue is not initialized.
 */
export function getDispatchQueue(): Queue<DispatchJobData> {
  const queue = queueRegistry.get<DispatchJobData>(queueName);
  if (!queue) {
    throw new Error(`${queueName} is not initialized; call initWorkers() before enqueuing dispatch jobs`);
  }
  return queue;
}

/**
 * Adds all dispatch jobs for a given resource.
 *
 * @param resource - The resource that was created or updated.
 * @param previousVersion - The previous version of the resource, if available
 * @param context - The background job context.
 */
export async function addDispatchJobs(
  resource: WithId<Resource>,
  previousVersion: Resource | undefined,
  context: BackgroundJobContext
): Promise<void> {
  const ctx = tryGetRequestContext();
  await addDispatchJobData({
    resourceType: resource.resourceType,
    id: resource.id,
    versionId: resource.meta?.versionId as string,
    previousVersionId: previousVersion?.meta?.versionId,
    interaction: context.interaction,
    requestId: ctx?.requestId,
    traceId: ctx?.traceId,
  });
}

/**
 * Adds a dispatch job to the queue.
 * @param job - The dispatch job details.
 */
async function addDispatchJobData(job: DispatchJobData): Promise<void> {
  await getDispatchQueue().add(jobName, job);
}

/**
 * Executes a dispatch job.
 * @param job - The dispatch job details.
 */
export async function execDispatchJob(job: Job<DispatchJobData>): Promise<void> {
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID); // shardId will be part of job.data in future
  const { resourceType, id, versionId, previousVersionId } = job.data;
  const resource = await systemRepo.readVersion(resourceType, id, versionId);
  const previousVersion = previousVersionId
    ? await systemRepo.readVersion(resourceType, id, previousVersionId)
    : undefined;
  const projectId = resource.meta?.project;
  const project = projectId ? await systemRepo.readResource<Project>('Project', projectId) : undefined;
  const interaction = job.data.interaction;
  const context = { interaction, project, systemRepo } as BackgroundJobContext;

  // Check if this resource was a Bot deployed to Lambda, if it was and this was a delete operation, we should remove the corresponding Lambda
  if (resource.resourceType === 'Bot' && resource.runtimeVersion === 'awslambda' && interaction === 'delete') {
    const name = getLambdaNameForBot(resource);
    try {
      const client = getBotManagementLambdaClient();
      await deleteLambda(client, name);
      getLogger().info('Lambda for Bot deleted', { botId: resource.id, lambdaName: name });
    } catch (err) {
      if (err instanceof ResourceNotFoundException) {
        getLogger().info('Lambda for Bot does not exist. Skipping delete', { botId: resource.id, lambdaName: name });
        return;
      }
      getLogger().error('Error deleting Lambda for Bot', {
        botId: resource.id,
        lambdaName: name,
        err,
      });
    }
  }

  try {
    await addSubscriptionJobs(resource, previousVersion, context);
  } catch (err) {
    getLogger().error('Error adding subscription jobs', {
      resourceType: resource.resourceType,
      resource: resource.id,
      err,
    });
  }

  if (interaction !== 'delete') {
    try {
      await addDownloadJobs(resource, previousVersion, context);
    } catch (err) {
      getLogger().error('Error adding download jobs', {
        resourceType: resource.resourceType,
        resource: resource.id,
        err,
      });
    }

    try {
      await addCronJobs(resource, previousVersion, context);
    } catch (err) {
      getLogger().error('Error adding cron jobs', {
        resourceType: resource.resourceType,
        resource: resource.id,
        err,
      });
    }
  }
}
