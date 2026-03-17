// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, isResourceWithId } from '@medplum/core';
import type { Project, Reference } from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';
import { getGlobalSystemRepo, getShardSystemRepo } from '../fhir/repo';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import { globalLogger } from '../logger';

export const GlobalResourceTypes = new Set([
  'Login',
  'DomainConfiguration',
  'JsonWebKey',
  // 'User',
  // 'ProjectMembership',
  // 'ClientApplication',
  // 'SmartAppLaunch',
]);

/**
 * Resource types that live on per-project shards but must also be readable from the global shard
 * for authN/authZ before the request's target shard is known.
 * These are replicated from shards to global via the shard sync outbox.
 */
export const SyncedResourceTypes = new Set([
  // Source of truth for project shard ID, but special handling is already taken for creating a shell Project in the global shard
  // That should probably be revisited so that Project is handled the same as other synced resource types
  // 'Project',
  // Read by ID during bearer token validation
  'ClientApplication',
  // Lookup by user during login
  'ProjectMembership',
  // Read by ID during login
  'SmartAppLaunch',
  // Read by email/externalId during auth
  // Read by id from authState.membership
  'User',
  // Read by ID during user security request, e.g. password reset
  'UserSecurityRequest',
  // SHARDING is Bot necessary?
  'Bot',
]);

export function getActiveShardId(project: Project): string | undefined {
  return project.shard?.[0]?.id;
}

export async function getProjectShardId(projectOrReferenceOrId: ProjectOrReferenceOrId): Promise<string> {
  // SHARDING - passing this through to getProjectAndProjectShardId is wasteful since it does a read of the project
  return (await getProjectAndProjectShardId(projectOrReferenceOrId)).shardId;
}

type ProjectOrReferenceOrId = Reference<Project> | WithId<Project> | string | undefined;

/**
 * Adds the shard to the project if it is not already present.
 * @param shardId - The shard ID to add to the project.
 * @param project - The project to add the shard to.
 */
export function setProjectShard(shardId: string, project: Project): void {
  project.shard = [{ id: shardId }];
}

export async function getProjectAndProjectShardId(
  projectOrReferenceOrId: ProjectOrReferenceOrId
): Promise<{ project: WithId<Project>; shardId: string }> {
  if (!getConfig().enableSharding) {
    let project: WithId<Project>;
    if (typeof projectOrReferenceOrId === 'string' || projectOrReferenceOrId === undefined) {
      // cast undefined to string to trigger readResource to throw not found
      project = await getGlobalSystemRepo().readResource('Project', projectOrReferenceOrId as string);
    } else if (isResourceWithId(projectOrReferenceOrId, 'Project')) {
      project = projectOrReferenceOrId;
    } else {
      project = await getGlobalSystemRepo().readReference<Project>(projectOrReferenceOrId);
    }
    return { project, shardId: GLOBAL_SHARD_ID };
  }

  let globalProject: WithId<Project>;
  if (typeof projectOrReferenceOrId === 'string' || projectOrReferenceOrId === undefined) {
    // cast undefined to string to trigger readResource to throw not found
    globalProject = await getGlobalSystemRepo().readResource('Project', projectOrReferenceOrId as string);
  } else if (isResourceWithId(projectOrReferenceOrId, 'Project')) {
    globalProject = await getGlobalSystemRepo().readResource('Project', projectOrReferenceOrId.id);
  } else {
    globalProject = await getGlobalSystemRepo().readReference<Project>(projectOrReferenceOrId);
  }

  const shardId = getActiveShardId(globalProject);

  if (shardId === undefined) {
    globalLogger.warn('Project shard not found', { project: getReferenceString(globalProject) });
    return { project: globalProject, shardId: getConfig().defaultShardId ?? GLOBAL_SHARD_ID };
  }

  if (shardId === GLOBAL_SHARD_ID) {
    // The project is in the global shard; done
    return { project: globalProject, shardId };
  }

  const systemRepo = getShardSystemRepo(shardId);
  const project = await systemRepo.readResource<Project>('Project', globalProject.id);
  return { project, shardId };
}
