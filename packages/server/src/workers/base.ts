// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { AsyncJob, Resource } from '@medplum/fhirtypes';
import { AsyncJobExecutor } from '../fhir/operations/utils/asyncjobexecutor';
import type { SystemRepository } from '../fhir/repo';
import { getProjectSystemRepo, getShardSystemRepo } from '../fhir/repo';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';

export type ProjectJobTarget =
  | {
      readonly kind: 'project';
      readonly projectId: string;
      readonly system?: never;
    }
  | {
      readonly kind: 'project';
      readonly system: true;
      readonly projectId?: never;
    };

export type ShardJobTarget = { readonly kind: 'shard'; readonly shardId: string };

export type JobTarget = ProjectJobTarget | ShardJobTarget;

export function getProjectJobTarget(resource: WithId<Resource>): ProjectJobTarget {
  return resource.meta?.project
    ? { kind: 'project', projectId: resource.meta.project }
    : { kind: 'project', system: true };
}

/**
 * Returns a system repository routed to the explicit durable job target.
 * @param target - The job's serialized routing target.
 * @returns A system repository routed to the target project, shard, or global resources.
 */
export async function getJobSystemRepo(target: JobTarget): Promise<SystemRepository> {
  switch (target.kind) {
    case 'project':
      if (target.system) {
        return getShardSystemRepo(GLOBAL_SHARD_ID);
      } else {
        return getProjectSystemRepo(target.projectId);
      }
    case 'shard':
      return getShardSystemRepo(target.shardId);
    default:
      target satisfies never;
      throw new TypeError(`Unsupported job target kind: ${(target as any).kind}`);
  }
}

export type AsyncJobTracking =
  | {
      readonly owner: 'project';
      readonly projectId: string;
      readonly asyncJobId: string;
    }
  | {
      readonly owner: 'system';
      readonly projectId?: never;
      readonly asyncJobId: string;
    };

// TODO this is too self-referential since nothing blocks system resources (without meta.project)
// from being created on any particular shard...
export function getAsyncJobTracking(asyncJob: WithId<Resource>): AsyncJobTracking {
  return asyncJob.meta?.project
    ? { owner: 'project', projectId: asyncJob.meta.project, asyncJobId: asyncJob.id }
    : { owner: 'system', asyncJobId: asyncJob.id };
}

/**
 * Hydrates the AsyncJob from its independently serialized owner and returns an executor bound to
 * that repository. The job's work target is intentionally unrelated to the AsyncJob's location.
 * @param tracking - The serialized location and ID of the tracking AsyncJob.
 * @returns An executor ready to inspect or update the AsyncJob.
 */
export async function getTrackingAsyncJobExecutor(tracking: AsyncJobTracking): Promise<AsyncJobExecutor> {
  const asyncJobSystemRepo =
    tracking.owner === 'project' ? await getProjectSystemRepo(tracking.projectId) : getShardSystemRepo(GLOBAL_SHARD_ID);
  const asyncJob = await asyncJobSystemRepo.readResource<AsyncJob>('AsyncJob', tracking.asyncJobId);

  return new AsyncJobExecutor(asyncJobSystemRepo, asyncJob);
}
