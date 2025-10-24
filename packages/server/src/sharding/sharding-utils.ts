// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { getReferenceString, isResourceWithId } from '@medplum/core';
import type { Project, Reference } from '@medplum/fhirtypes';
import { getConfig } from '../config/loader';
import { getGlobalSystemRepo, getSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import type { GlobalProject } from './sharding-types';

export const GLOBAL_SHARD_ID = 'global';

export const GlobalResourceTypes = new Set([
  'User',
  'Login',
  'ProjectMembership',
  'ClientApplication',
  'SmartAppLaunch',
  'DomainConfiguration',
  'JsonWebKey',
]);

function getActiveShardId(project: GlobalProject): string | undefined {
  return project.shard?.[0]?.id;
}

export async function getProjectShardId(projectOrReferenceOrId: ProjectOrReferenceOrId): Promise<string> {
  // TODO{sharding} - passing this through to getProjectAndProjectShardId is wasteful since it does a read of the project
  return (await getProjectAndProjectShardId(projectOrReferenceOrId)).projectShardId;
}

type ProjectOrReferenceOrId = Reference<Project> | WithId<Project> | string;

export async function getProjectAndProjectShardId(
  projectOrReferenceOrId: ProjectOrReferenceOrId
): Promise<{ project: WithId<Project>; projectShardId: string }> {
  if (!getConfig().enableSharding) {
    let project: WithId<Project>;
    if (typeof projectOrReferenceOrId === 'string') {
      project = await getGlobalSystemRepo().readResource('Project', projectOrReferenceOrId);
    } else if (isResourceWithId(projectOrReferenceOrId, 'Project')) {
      project = projectOrReferenceOrId;
    } else {
      project = await getGlobalSystemRepo().readReference<Project>(projectOrReferenceOrId);
    }
    return { project, projectShardId: GLOBAL_SHARD_ID };
  }

  let globalProject: GlobalProject;
  if (typeof projectOrReferenceOrId === 'string') {
    globalProject = await getGlobalSystemRepo().readResource('Project', projectOrReferenceOrId);
  } else if (isResourceWithId(projectOrReferenceOrId, 'Project')) {
    globalProject = await getGlobalSystemRepo().readResource('Project', projectOrReferenceOrId.id);
  } else {
    globalProject = await getGlobalSystemRepo().readReference<Project>(projectOrReferenceOrId);
  }

  const projectShardId = getActiveShardId(globalProject);

  if (projectShardId === undefined) {
    globalLogger.warn('Project shard not found', { project: getReferenceString(globalProject) });
    return { project: globalProject as WithId<Project>, projectShardId: getConfig().defaultShardId ?? GLOBAL_SHARD_ID };
  }

  if (projectShardId === GLOBAL_SHARD_ID) {
    // The project is in the global shard; done
    return { project: globalProject as WithId<Project>, projectShardId };
  }

  const systemRepo = getSystemRepo(undefined, projectShardId);
  const project = await systemRepo.readResource<Project>('Project', globalProject.id);
  return { project, projectShardId };
}
