// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, isResourceWithId } from '@medplum/core';
import type { Project, Reference } from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';
import { getGlobalSystemRepo, getShardSystemRepo } from '../fhir/repo';
import { GLOBAL_SHARD_ID } from '../fhir/sharding';
import { globalLogger } from '../logger';
import type { GlobalProject } from './sharding-types';

export const GlobalResourceTypes = new Set([
  'Login',
  'DomainConfiguration',
  'JsonWebKey',
  // 'User',
  // 'ProjectMembership',
  // 'ClientApplication',
  // 'SmartAppLaunch',
]);

function getActiveShardId(project: GlobalProject): string | undefined {
  return project.shard?.[0]?.id;
}

export async function getProjectShardId(projectOrReferenceOrId: ProjectOrReferenceOrId): Promise<string> {
  // SHARDING - passing this through to getProjectAndProjectShardId is wasteful since it does a read of the project
  return (await getProjectAndProjectShardId(projectOrReferenceOrId)).shardId;
}

type ProjectOrReferenceOrId = Reference<Project> | WithId<Project> | string | undefined;

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

  let globalProject: GlobalProject;
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
    return { project: globalProject as WithId<Project>, shardId: getConfig().defaultShardId ?? GLOBAL_SHARD_ID };
  }

  if (shardId === GLOBAL_SHARD_ID) {
    // The project is in the global shard; done
    return { project: globalProject as WithId<Project>, shardId };
  }

  const systemRepo = getShardSystemRepo(shardId);
  const project = await systemRepo.readResource<Project>('Project', globalProject.id);
  return { project, shardId };
}
