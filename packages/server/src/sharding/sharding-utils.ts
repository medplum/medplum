// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  badRequest,
  getReferenceString,
  isResourceWithId,
  OperationOutcomeError,
  protectedResourceTypes,
  resolveId,
} from '@medplum/core';
import type { Project, Reference, Resource, User } from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';
import type { SystemRepository } from '../fhir/repo';
import { getGlobalSystemRepo, getProjectSystemRepo, getShardSystemRepo } from '../fhir/repo';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import { globalLogger } from '../logger';

// Types only allowed on the global shard
// ['Login', 'DomainConfiguration', 'JsonWebKey'];
export const GlobalResourceTypes = new Set(protectedResourceTypes);

/**
 * Resource types that live on per-project shards but must also be readable from the global shard
 * for authN/authZ before the request's target shard is known.
 * These are replicated from shards to global via the shard sync outbox.
 */
export const SyncedResourceTypes = new Set([
  // Source of truth for project shard ID, but special handling is already taken for creating a shell Project in the global shard
  // That should probably be revisited so that Project is handled the same as other synced resource types
  'Project',
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
  // Read by ID in storage endpoints
  'Binary',
  // 'UserConfiguration', // SHARDING need to be synced?
  // 'Agent' // SHARDING need to be synced?
  // 'Bot',
]);

export function getActiveShardId(project: Project): string | undefined {
  return project.shard?.[0]?.id;
}

type ResourceOrReferenceOrId<T extends Resource> = Reference<T> | WithId<T> | string | undefined;
type ProjectOrReferenceOrId = ResourceOrReferenceOrId<Project>;

export async function getProjectShardId(projectOrReferenceOrId: ProjectOrReferenceOrId): Promise<string> {
  if (!getConfig().enableSharding) {
    return GLOBAL_SHARD_ID;
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
    return getConfig().defaultShardId ?? GLOBAL_SHARD_ID;
  }

  return shardId;
}

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

export async function getUserAndSystemRepository(
  userReference: Reference<User>,
  shardId: string | undefined
): Promise<{ globalUser: WithId<User>; user: WithId<User>; systemRepo: SystemRepository }> {
  let systemRepo: SystemRepository;
  let user: WithId<User>;

  // SHARDING - User is synced to the global shard, so first read from there.
  // If the user is project scoped, read from the project shard if necessary.
  const globalSystemRepo = getGlobalSystemRepo();
  const globalUser = await globalSystemRepo.readReference<User>(userReference);
  if (globalUser.project && shardId !== GLOBAL_SHARD_ID) {
    // project-scoped user
    const globalUserProjectId = resolveId(globalUser.project);
    if (!globalUserProjectId) {
      throw new OperationOutcomeError(badRequest('Invalid project reference', 'user'));
    }

    if (shardId) {
      // If provided, restrict to the specified shard
      // SHARDING - consider getting rid of the shardId-based path for simplicity?
      systemRepo = getShardSystemRepo(shardId);
    } else {
      // Otherwise, read from the project shard
      systemRepo = await getProjectSystemRepo(globalUser.project);
    }
    user = await systemRepo.readReference<User>(userReference);
  } else {
    // server-scoped user
    systemRepo = globalSystemRepo;
    user = globalUser;
  }

  return { globalUser, user, systemRepo };
}
