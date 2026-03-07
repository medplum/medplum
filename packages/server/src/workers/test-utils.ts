import { ContentType, type BackgroundJobInteraction } from '@medplum/core';
import type { Resource, Subscription } from '@medplum/fhirtypes';
import type { Job, Queue } from 'bullmq';
import { execDispatchJob, getDispatchQueue } from './dispatch';
import { execDownloadJob, getDownloadQueue } from './download';
import { execSubscriptionJob, getSubscriptionQueue } from './subscription';
/**
 * Finds the dispatch job for the given resource and interaction, and executes it.
 * This emulates what BullMQ would do when processing the job, and allows us to test the effects of the job in our unit tests.
 * @param resource - The resource that was created or updated.
 * @param interaction - The interaction that triggered the job (e.g. 'create', 'update', etc.).
 */
export async function findAndExecDispatchJob(resource: Resource, interaction: BackgroundJobInteraction): Promise<void> {
  await findAndExecJob(
    getDispatchQueue,
    execDispatchJob,
    (jobData) =>
      jobData.interaction === interaction &&
      jobData.resourceType === resource.resourceType &&
      jobData.id === resource.id
  );
}

/**
 * Finds the subscription job for the given resource and interaction, and executes it.
 * Also executes the dispatch job, since the subscription job is added by the dispatch job.
 * This emulates what BullMQ would do when processing the job, and allows us to test the effects of the job in our unit tests.
 * @param resource - The resource that was created or updated.
 * @param interaction - The interaction that triggered the job (e.g. 'create', 'update', etc.).
 * @param subscription - Optional subscription to match. If not provided, will match any subscription job for the resource and interaction.
 * @returns The list of subscription jobs that were executed (there may be more than one if the job was retried).
 */
export async function findAndExecSubscriptionJob(
  resource: Resource,
  interaction: BackgroundJobInteraction,
  subscription?: Subscription
): Promise<Job[]> {
  await findAndExecDispatchJob(resource, interaction);
  return findAndExecJob(
    getSubscriptionQueue,
    execSubscriptionJob,
    (jobData) =>
      jobData.interaction === interaction &&
      jobData.resourceType === resource.resourceType &&
      jobData.id === resource.id &&
      (!subscription || jobData.subscriptionId === subscription.id)
  );
}

export async function findAndExecDownloadJob(
  resource: Resource,
  interaction: BackgroundJobInteraction,
  url?: string
): Promise<Job[]> {
  await findAndExecDispatchJob(resource, interaction);
  return findAndExecJob(
    getDownloadQueue,
    execDownloadJob,
    // (jobData) => jobData.resourceType === resource.resourceType && jobData.id === resource.id
    (jobData) => {
      //   console.log('Test', {
      //     resourceType: jobData.resourceType,
      //     id: jobData.id,
      //     match: jobData.resourceType === resource.resourceType && jobData.id === resource.id,
      //   });
      return (
        jobData.resourceType === resource.resourceType && jobData.id === resource.id && (!url || jobData.url === url)
      );
    }
  );
}

async function findAndExecJob(
  getQueue: () => Queue | undefined,
  execJob: (job: Job) => Promise<void>,
  matchJob: (jobData: any) => boolean
): Promise<Job[]> {
  const queue = getQueue();
  if (!queue) {
    throw new Error('Queue not initialized');
  }

  const jobData = (queue.add as jest.Mock).mock.calls.find(([_jobName, data]) => matchJob(data))?.[1];
  if (!jobData) {
    throw new Error('Job not found');
  }

  const result: Job[] = [];
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const job = {
      id: 1 + attempt,
      data: jobData,
      attemptsMade: attempt,
      changePriority: jest.fn(),
    } as unknown as Job;
    result.push(job);
    try {
      await execJob(job);
      break; // Exit loop if successful
    } catch (err) {
      if (attempt === maxRetries - 1) {
        throw err;
      }
    }
  }

  return result;
}

export function mockFetchResponse(status: number, body: any, headers: Record<string, string> = {}): Response {
  return {
    status,
    headers: {
      get(name: string): string | null {
        return (
          {
            'content-disposition': 'attachment; filename=download-1',
            'content-type': ContentType.TEXT,
            ...headers,
          }[name] ?? null
        );
      },
    } as Headers,
    body,
  } as Response;
}
