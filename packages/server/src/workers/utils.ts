// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, flatMapFilter, getExtension, isResourceWithId, Operator, WithId } from '@medplum/core';
import {
  AsyncJob,
  AuditEvent,
  AuditEventEntity,
  Bot,
  Coding,
  Parameters,
  Practitioner,
  ProjectMembership,
  Reference,
  Resource,
  Subscription,
} from '@medplum/fhirtypes';
import { DelayedError, Job, Queue, Worker } from 'bullmq';
import * as semver from 'semver';
import { MedplumServerConfig } from '../config/types';
import { buildTracingExtension } from '../context';
import { getSystemRepo, Repository } from '../fhir/repo';
import { getLogger, globalLogger } from '../logger';
import { AuditEventOutcome } from '../util/auditevent';
import { getServerVersion } from '../util/version';

export function findProjectMembership(
  project: string,
  profile: Reference
): Promise<WithId<ProjectMembership> | undefined> {
  const systemRepo = getSystemRepo();
  return systemRepo.searchOne<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: `Project/${project}`,
      },
      {
        code: 'profile',
        operator: Operator.EQUALS,
        value: profile.reference as string,
      },
    ],
  });
}

/**
 * Creates an AuditEvent for a subscription attempt.
 * @param resource - The resource that triggered the subscription.
 * @param startTime - The time the subscription attempt started.
 * @param outcome - The outcome code.
 * @param outcomeDesc - The outcome description text.
 * @param subscription - Optional rest-hook subscription.
 * @param bot - Optional bot that was executed.
 */
export async function createAuditEvent(
  resource: Resource,
  startTime: string,
  outcome: AuditEventOutcome,
  outcomeDesc?: string,
  subscription?: Subscription,
  bot?: Bot
): Promise<void> {
  const systemRepo = getSystemRepo();
  const auditedEvent = subscription ?? resource;

  await systemRepo.createResource<AuditEvent>({
    resourceType: 'AuditEvent',
    meta: {
      project: auditedEvent.meta?.project,
      account: auditedEvent.meta?.account,
    },
    period: {
      start: startTime,
      end: new Date().toISOString(),
    },
    recorded: new Date().toISOString(),
    type: {
      code: 'transmit',
    },
    agent: [
      {
        type: {
          text: auditedEvent.resourceType,
        },
        requestor: false,
      },
    ],
    source: {
      observer: createReference(auditedEvent) as Reference as Reference<Practitioner>,
    },
    entity: createAuditEventEntities(resource, subscription, bot),
    outcome,
    outcomeDesc,
    extension: buildTracingExtension(),
  });
}

export function createAuditEventEntities(...resources: unknown[]): AuditEventEntity[] {
  return flatMapFilter(resources, (v) => (isResourceWithId(v) ? createAuditEventEntity(v) : undefined));
}

export function createAuditEventEntity(resource: Resource): AuditEventEntity {
  return {
    what: createReference(resource),
    role: getAuditEventEntityRole(resource),
  };
}

export function getAuditEventEntityRole(resource: Resource): Coding {
  switch (resource.resourceType) {
    case 'Patient':
      return { code: '1', display: 'Patient' };
    case 'Subscription':
      return { code: '9', display: 'Subscriber' };
    default:
      return { code: '4', display: 'Domain' };
  }
}

export function isJobSuccessful(subscription: Subscription, status: number): boolean {
  const successCodes = getExtension(
    subscription,
    'https://medplum.com/fhir/StructureDefinition/subscription-success-codes'
  );

  if (!successCodes?.valueString) {
    return defaultStatusCheck(status);
  }

  // Removing any white space
  const codesTrimSpace = successCodes.valueString.replace(/ /g, '');
  const listOfSuccessCodes = codesTrimSpace.split(',');

  for (const code of listOfSuccessCodes) {
    if (code.includes('-')) {
      const codeRange = code.split('-');
      const lowerBound = Number(codeRange[0]);
      const upperBound = Number(codeRange[1]);
      if (!(Number.isInteger(lowerBound) && Number.isInteger(upperBound))) {
        getLogger().debug(
          `${lowerBound} and ${upperBound} aren't an integer, configured status codes need to be changed. Resorting to default codes`
        );
        return defaultStatusCheck(status);
      }
      if (status >= lowerBound && status <= upperBound) {
        return true;
      }
    } else {
      const codeValue = Number(code);
      if (!Number.isInteger(codeValue)) {
        getLogger().debug(
          `${code} isn't an integer, configured status codes need to be changed. Resorting to default codes`
        );
        return defaultStatusCheck(status);
      }
      if (status === Number(code)) {
        return true;
      }
    }
  }
  return false;
}

function defaultStatusCheck(status: number): boolean {
  return status >= 200 && status < 400;
}

export const InProgressAsyncJobStatuses: AsyncJob['status'][] = ['accepted', 'active'];

export function isJobActive(asyncJob: WithId<AsyncJob>): boolean {
  return InProgressAsyncJobStatuses.includes(asyncJob.status);
}

export function isJobCompatible(asyncJob: WithId<AsyncJob>): boolean {
  return !asyncJob.minServerVersion || semver.gte(getServerVersion(), asyncJob.minServerVersion);
}

export async function updateAsyncJobOutput(
  repo: Repository,
  asyncJob: WithId<AsyncJob>,
  output: Parameters
): Promise<WithId<AsyncJob>> {
  return repo.updateResource<AsyncJob>(
    {
      ...asyncJob,
      output,
    },
    {
      // Conditional update to ensure this update does not clobber another,
      // which could result in e.g. continuing a job that was cancelled
      ifMatch: asyncJob.meta?.versionId,
    }
  );
}

export type WorkerInitializer = (config: MedplumServerConfig) => { queue: Queue; worker: Worker; name: string };

export interface QueueRegistry {
  add(name: string, queue: Queue, worker: Worker): void;
  get<T>(name: string): Queue<T> | undefined;
  isClosing(name: string): boolean | undefined;
  closeAll(): Promise<void>[];
}

type QueueEntry = { queue: Queue | undefined; worker: Worker | undefined; isClosing: boolean };

// exported for testing only, use `queueRegistry` for non-test code
export class DefaultQueueRegistry implements QueueRegistry {
  private queueMap: Record<string, QueueEntry | undefined>;

  constructor() {
    this.queueMap = Object.create(null);
  }

  add(name: string, queue: Queue, worker: Worker): void {
    if (this.queueMap[name]) {
      throw new Error(`Queue ${name} already registered`);
    }

    this.queueMap[name] = { queue, worker, isClosing: false };

    worker.on('closing', () => {
      if (this.queueMap[name]) {
        this.queueMap[name].isClosing = true;
      }
    });
  }

  get<T>(name: string): Queue<T> | undefined {
    return this.queueMap[name]?.queue as Queue<T> | undefined;
  }

  private async close(name: string): Promise<void> {
    const entry = this.queueMap[name];
    if (!entry) {
      return;
    }

    // Close worker first, so any jobs that need to finish can enqueue the next job before exiting
    if (entry.worker) {
      await entry.worker.close();
      entry.worker = undefined;
    }

    if (entry.queue) {
      await entry.queue.close();
      entry.queue = undefined;
    }

    delete this.queueMap[name];
  }

  closeAll(): Promise<void>[] {
    const promises = Object.keys(this.queueMap).map(async (name) => {
      return this.close(name);
    });
    return promises;
  }

  isClosing(name: string): boolean | undefined {
    return this.queueMap[name]?.isClosing;
  }
}

export const queueRegistry: QueueRegistry = new DefaultQueueRegistry();

function getFinishedJobFieldsForLogging(job: Job): Record<string, string | number | undefined> {
  return {
    jobId: job.id,
    jobTimestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    queuedDurationMs: job.processedOn && job.processedOn - job.timestamp,
    executionDurationMs: job.processedOn && job.finishedOn && job.finishedOn - job.processedOn,
    totalDurationMs: job.finishedOn && job.finishedOn - job.timestamp,
    attemptsMade: job.attemptsMade,
    attemptsStarted: job.attemptsStarted,
  };
}
export function addVerboseQueueLogging<TDataType>(
  queue: Queue,
  worker: Worker,
  getJobDataLoggingFields?: (job: Job<TDataType>) => Record<string, string | number | undefined>
): void {
  worker.on('active', (job, prev) => {
    globalLogger.info(`${queue.name} worker: active`, {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      attemptsStarted: job.attemptsStarted,
      ...getJobDataLoggingFields?.(job),
      prev,
    });
  });
  worker.on('closing', async (message) => {
    globalLogger.info(`${queue.name} worker: closing`, { message });
  });
  worker.on('closed', async () => {
    globalLogger.info(`${queue.name} worker: closed`);
  });
  worker.on('completed', async (job, result, prev) => {
    globalLogger.info(`${queue.name} worker: completed`, {
      ...getFinishedJobFieldsForLogging(job),
      ...getJobDataLoggingFields?.(job),
      result,
      prev,
    });
  });
  worker.on('error', (failedReason) =>
    globalLogger.info(`${queue.name} worker: error`, {
      error: failedReason instanceof Error ? failedReason.message : String(failedReason),
      stack: failedReason instanceof Error ? failedReason.stack : undefined,
    })
  );
  worker.on('failed', (job, error, prev) =>
    globalLogger.info(`${queue.name} worker: failed`, {
      ...(job && getFinishedJobFieldsForLogging(job)),
      ...(job && getJobDataLoggingFields?.(job)),
      prev,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  );
  worker.on('stalled', (jobId, prev) => {
    globalLogger.info(`${queue.name} worker: stalled`, { jobId, prev });
  });
}

export async function moveToDelayedAndThrow(job: Job, reason: string): Promise<never> {
  if (job.token) {
    const delayMs = 60_000;
    globalLogger.info(reason, {
      queueName: job.queueName,
      jobId: job.id,
      delayMs,
    });
    await job.moveToDelayed(Date.now() + delayMs, job.token);
    throw new DelayedError(reason);
  }
  globalLogger.error('Cannot delay job since job.token is not available', {
    queueName: job.queueName,
    jobId: job.id,
    reason,
  });

  // This is one of those "this should never happen" errors. job.token is expected to always be set
  // given the way we use bullmq.
  throw new Error('Cannot delay Post-deploy migration job since job.token is not available');
}
