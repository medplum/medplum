import { arrayify, crawlResource, isGone, normalizeOperationOutcome, TypedValue } from '@medplum/core';
import { Attachment, Binary, Meta, Resource, ResourceType } from '@medplum/fhirtypes';
import { Job, Queue, QueueBaseOptions, Worker } from 'bullmq';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { getConfig, MedplumServerConfig } from '../config';
import { getRequestContext, tryGetRequestContext, tryRunInRequestContext } from '../context';
import { getSystemRepo } from '../fhir/repo';
import { getBinaryStorage } from '../fhir/storage';
import { globalLogger } from '../logger';
import { parseTraceparent } from '../traceparent';

/*
 * The download worker inspects resources,
 * looking for external URLs that need to be downloaded.
 *
 * If an external URL is found, the worker attempts to download the content,
 * and use the Medplum server storage service.
 *
 * On successfully downloading the content, the worker updates the resource
 * with the Binary resource.
 */

export interface DownloadJobData {
  readonly resourceType: ResourceType;
  readonly id: string;
  readonly url: string;
  readonly requestId?: string;
  readonly traceId?: string;
}

const queueName = 'DownloadQueue';
const jobName = 'DownloadJobData';
let queue: Queue<DownloadJobData> | undefined = undefined;
let worker: Worker<DownloadJobData> | undefined = undefined;

/**
 * Initializes the download worker.
 * Sets up the BullMQ job queue.
 * Sets up the BullMQ worker.
 * @param config - The Medplum server config to use.
 */
export function initDownloadWorker(config: MedplumServerConfig): void {
  const defaultOptions: QueueBaseOptions = {
    connection: config.redis,
  };

  queue = new Queue<DownloadJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  worker = new Worker<DownloadJobData>(
    queueName,
    (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execDownloadJob(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  worker.on('completed', (job) => globalLogger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));
}

/**
 * Shuts down the download worker.
 * Closes the BullMQ job queue.
 * Closes the BullMQ worker.
 */
export async function closeDownloadWorker(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }

  if (worker) {
    await worker.close();
    worker = undefined;
  }
}

/**
 * Returns the download queue instance.
 * This is used by the unit tests.
 * @returns The download queue (if available).
 */
export function getDownloadQueue(): Queue<DownloadJobData> | undefined {
  return queue;
}

/**
 * Adds all download jobs for a given resource.
 *
 * There are a few important structural considerations:
 * 1) One resource change can spawn multiple download jobs.
 * 2) Download jobs can fail, and must be retried independently.
 * 3) Downloads should be evaluated at the time of the resource change.
 *
 * So, when a resource changes (create or update), we evaluate all downloaders
 * at that moment in time.  For each matching download, we enqueue the job.
 * The only purpose of the job is to make the outbound HTTP request,
 * not to re-evaluate the download.
 * @param resource - The resource that was created or updated.
 */
export async function addDownloadJobs(resource: Resource): Promise<void> {
  const ctx = tryGetRequestContext();
  for (const attachment of getAttachments(resource)) {
    if (isExternalUrl(attachment.url)) {
      await addDownloadJobData({
        resourceType: resource.resourceType,
        id: resource.id as string,
        url: attachment.url,
        requestId: ctx?.requestId,
        traceId: ctx?.traceId,
      });
    }
  }
}

/**
 * Determines if a content URL is an external URL.
 *
 * URL's are "internal" if:
 *  1) They refer to a fully qualified fhir/R4/Binary/ endpoint.
 *  2) They refer to the Medplum storage URL.
 *  3) They refer to a Binary in canonical form (i.e., "Binary/123").
 * @param url - The Media content URL.
 * @returns True if the URL is an external URL.
 */
function isExternalUrl(url: string | undefined): url is string {
  return !!(
    url &&
    !url.startsWith(getConfig().baseUrl + 'fhir/R4/Binary/') &&
    !url.startsWith(getConfig().storageBaseUrl) &&
    !url.startsWith('Binary/')
  );
}

/**
 * Adds a download job to the queue.
 * @param job - The download job details.
 */
async function addDownloadJobData(job: DownloadJobData): Promise<void> {
  if (queue) {
    await queue.add(jobName, job);
  }
}

/**
 * Executes a download job.
 * @param job - The download job details.
 */
export async function execDownloadJob<T extends Resource = Resource>(job: Job<DownloadJobData>): Promise<void> {
  const systemRepo = getSystemRepo();
  const ctx = getRequestContext();
  const { resourceType, id, url } = job.data;

  let resource: T;
  try {
    resource = await systemRepo.readResource<T>(resourceType, id);
  } catch (err) {
    const outcome = normalizeOperationOutcome(err);
    if (isGone(outcome)) {
      // If the resource was deleted, then stop processing it.
      return;
    }
    throw err;
  }

  if (!JSON.stringify(resource).includes(url)) {
    // If the resource no longer includes the URL, then stop processing it.
    return;
  }

  const headers: HeadersInit = {};
  const traceId = job.data.traceId;
  if (traceId) {
    headers['x-trace-id'] = traceId;
    if (parseTraceparent(traceId)) {
      headers['traceparent'] = traceId;
    }
  }

  try {
    ctx.logger.info('Requesting content at: ' + url);
    const response = await fetch(url, {
      headers,
    });

    ctx.logger.info('Received status: ' + response.status);
    if (response.status >= 400) {
      throw new Error('Received status ' + response.status);
    }

    const contentDisposition = response.headers.get('content-disposition') as string | undefined;
    const contentType = response.headers.get('content-type') as string;
    const binary = await systemRepo.createResource<Binary>({
      resourceType: 'Binary',
      contentType,
      meta: {
        project: resource.meta?.project,
      },
      securityContext: {
        reference: `${resource.resourceType}/${resource.id}`,
      },
    });
    if (response.body === null) {
      throw new Error('Received null response body');
    }

    // From node-fetch docs:
    // Note that while the Fetch Standard requires the property to always be a WHATWG ReadableStream, in node-fetch it is a Node.js Readable stream.
    await getBinaryStorage().writeBinary(binary, contentDisposition, contentType, response.body as Readable);

    const updated = JSON.parse(JSON.stringify(resource).replace(url, `Binary/${binary.id}`)) as Resource;
    (updated.meta as Meta).author = { reference: 'system' };
    await systemRepo.updateResource(updated);
    ctx.logger.info('Downloaded content successfully');
  } catch (ex) {
    ctx.logger.info('Download exception: ' + ex);
    throw ex;
  }
}

function getAttachments(resource: Resource): Attachment[] {
  const attachments: Attachment[] = [];
  crawlResource(resource, {
    visitProperty: (_parent, _key, _path, propertyValues) => {
      for (const propertyValue of propertyValues) {
        if (propertyValue) {
          for (const value of arrayify(propertyValue) as TypedValue[]) {
            if (value.type === 'Attachment') {
              attachments.push(value.value as Attachment);
            }
          }
        }
      }
    },
  });
  return attachments;
}
