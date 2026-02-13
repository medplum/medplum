// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BackgroundJobContext, TypedValueWithPath, WithId } from '@medplum/core';
import {
  arrayify,
  crawlTypedValue,
  getReferenceString,
  isGone,
  normalizeOperationOutcome,
  pathToJSONPointer,
  toTypedValue,
} from '@medplum/core';
import type { Binary, Project, Resource, ResourceType } from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import fetch from 'node-fetch';
import type { Readable } from 'node:stream';
import { Pointer } from 'rfc6902';
import { getConfig } from '../config/loader';
import { tryGetRequestContext, tryRunInRequestContext } from '../context';
import { getSystemRepo } from '../fhir/repo';
import { getLogger, globalLogger } from '../logger';
import { getBinaryStorage } from '../storage/loader';
import { parseTraceparent } from '../traceparent';
import type { WorkerInitializer } from './utils';
import { getBullmqRedisConnectionOptions, queueRegistry } from './utils';

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

export const initDownloadWorker: WorkerInitializer = (config) => {
  const defaultOptions: QueueBaseOptions = {
    connection: getBullmqRedisConnectionOptions(config),
  };

  const queue = new Queue<DownloadJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  });

  const worker = new Worker<DownloadJobData>(
    queueName,
    (job) => tryRunInRequestContext(job.data.requestId, job.data.traceId, () => execDownloadJob(job)),
    {
      ...defaultOptions,
      ...config.bullmq,
    }
  );
  worker.on('completed', (job) => globalLogger.info(`Completed job ${job.id} successfully`));
  worker.on('failed', (job, err) => globalLogger.info(`Failed job ${job?.id} with ${err}`));

  return { queue, worker, name: queueName };
};

/**
 * Returns the download queue instance.
 * This is used by the unit tests.
 * @returns The download queue (if available).
 */
export function getDownloadQueue(): Queue<DownloadJobData> | undefined {
  return queueRegistry.get(queueName);
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
 * @param previousVersion - The previous version of the resource, if available
 * @param context - The background job context.
 */
export async function addDownloadJobs(
  resource: WithId<Resource>,
  previousVersion: Resource | undefined,
  context: BackgroundJobContext
): Promise<void> {
  if (!getConfig().autoDownloadEnabled) {
    return;
  }

  const project = context?.project;
  if (!project) {
    return;
  }

  const ctx = tryGetRequestContext();
  for (const attachment of getAttachments(resource)) {
    // Only process allowed external URLs
    const url = attachment.value.url;
    if (!isExternalUrl(url) || !isUrlAllowedByProject(project, url)) {
      continue;
    }

    // Skip if this mutation didn't adjust the URL in question
    // Note that there are some cases where we detect a change when an element
    // _moved_ in the path tree without actually changing. For example, if you
    // delete an element at array index 0, the remaining items in the array
    // will shift their index down by 1.
    //
    // Given that this is a low frequency type of mutation, we prefer to pay
    // the (low) cost of a double-enqueued download job instead of trying to
    // detect path moves on every mutation.
    const pointer = Pointer.fromJSON(`${pathToJSONPointer(attachment.path)}/url`);
    if (pointer.get(resource) === pointer.get(previousVersion)) {
      continue;
    }

    await addDownloadJobData({
      resourceType: resource.resourceType,
      id: resource.id,
      url,
      requestId: ctx?.requestId,
      traceId: ctx?.traceId,
    });
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
    url.startsWith('https://') &&
    !url.startsWith(getConfig().baseUrl + 'fhir/R4/Binary/') &&
    !url.startsWith(getConfig().storageBaseUrl) &&
    !url.startsWith('Binary/')
  );
}

/**
 * Determines if a URL is allowed for auto-download.
 * @param project - The project settings.
 * @param url - The URL to check.
 * @returns True if the URL is allowed for auto-download.
 */
function isUrlAllowedByProject(project: Project, url: string): boolean {
  if (project.setting?.find((s) => s.name === 'autoDownloadEnabled')?.valueBoolean === false) {
    // If the project has auto-download disabled, then ignore all URLs.
    return false;
  }

  const allowedUrlPrefixes =
    project.setting?.find((s) => s.name === 'autoDownloadAllowedUrlPrefixes')?.valueString?.split(',') ?? [];
  if (allowedUrlPrefixes.length > 0 && !allowedUrlPrefixes.some((prefix) => url.startsWith(prefix))) {
    // If allowed URLs are specified and the URL does not match an allowed prefix, then ignore it.
    return false;
  }

  const ignoredUrlPrefixes =
    project.setting?.find((s) => s.name === 'autoDownloadIgnoredUrlPrefixes')?.valueString?.split(',') ?? [];
  if (ignoredUrlPrefixes.some((prefix) => url.startsWith(prefix))) {
    // If the URL matches an ignored prefix, then ignore it.
    return false;
  }

  return true;
}

/**
 * Adds a download job to the queue.
 * @param job - The download job details.
 */
async function addDownloadJobData(job: DownloadJobData): Promise<void> {
  const queue = getDownloadQueue();
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
  const log = getLogger();
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

  const projectId = resource.meta?.project;
  if (!projectId) {
    return;
  }

  const project = await systemRepo.readResource<Project>('Project', projectId);
  if (!isUrlAllowedByProject(project, url)) {
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

  const reference = getReferenceString(resource);

  try {
    log.info('Requesting content at: ' + url);
    const response = await fetch(url, {
      headers,
    });

    log.info('Received status: ' + response.status);
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
        reference,
      },
    });
    if (response.body === null) {
      throw new Error('Received null response body');
    }

    // From node-fetch docs:
    // Note that while the Fetch Standard requires the property to always be a WHATWG ReadableStream, in node-fetch it is a Node.js Readable stream.
    await getBinaryStorage().writeBinary(binary, contentDisposition, contentType, response.body as Readable);
    log.info('Downloaded content successfully', { binaryId: binary.id });

    // re-fetch resource so we are mutating as recent a copy as possible
    // (there may have been other mutations applied while we were writing the
    // object into storage)
    resource = await systemRepo.readResource<T>(resourceType, id);

    const attachments = getAttachments(resource);
    const patches = attachments
      .filter((attachment) => attachment.value.url === url)
      .map((value) => ({
        op: 'replace' as const,
        path: `${pathToJSONPointer(value.path)}/url`,
        value: `Binary/${binary.id}`,
      }));

    if (patches.length === 0) {
      // This can happen if we double enqueued autodownload jobs for the same
      // URL, or if a user has amended a resource they wrote faster than this
      // job ran.
      log.info('Download succeeded but original URL no longer found in resource', {
        resourceType,
        id,
        url,
        binaryId: binary.id,
      });
      return;
    }

    await systemRepo.patchResource(
      resourceType,
      id,
      [...patches, { op: 'replace', path: '/meta/author', value: { reference: 'system' } }],
      { ifMatch: resource.meta?.versionId }
    );
  } catch (err) {
    log.info('Download error', { projectId, reference, url, err });
    throw err;
  }
}

export function getAttachments(resource: Resource): TypedValueWithPath[] {
  const attachments: TypedValueWithPath[] = [];
  crawlTypedValue(toTypedValue(resource), {
    visitProperty: (_parent, _key, _path, propertyValues) => {
      for (const propertyValue of propertyValues) {
        for (const value of arrayify(propertyValue)) {
          if (value.type === 'Attachment') {
            attachments.push(value);
          }
        }
      }
    },
  });
  return attachments;
}
