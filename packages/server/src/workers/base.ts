// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';

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

export function getAsyncJobTracking(asyncJob: WithId<Resource>): AsyncJobTracking {
  return asyncJob.meta?.project
    ? { owner: 'project', projectId: asyncJob.meta.project, asyncJobId: asyncJob.id }
    : { owner: 'system', asyncJobId: asyncJob.id };
}
