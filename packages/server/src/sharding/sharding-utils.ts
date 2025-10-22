// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project, Reference } from '@medplum/fhirtypes';
import { getGlobalSystemRepo, getSystemRepo } from '../fhir/repo';
import type { GlobalProject } from './sharding-types';

export const GLOBAL_SHARD_ID = 'global';

export function getProjectShardId(
  project: GlobalProject,
  defaultShardId: string = 'TODO-getProjectShardIdDefault'
): string {
  console.log('getProjectShardId', project.id, JSON.stringify(project.shard));
  return project.shard?.[0]?.id ?? defaultShardId;
}

export async function getProjectAndProjectShardId(
  projectReference: Reference<Project>
): Promise<{ project: WithId<Project>; projectShardId: string }> {
  const globalSystemRepo = getGlobalSystemRepo();
  const globalProject: GlobalProject = await globalSystemRepo.readReference<Project>(
    projectReference as Reference<Project>
  );

  const projectShardId = getProjectShardId(globalProject);
  if (projectShardId === 'global') {
    // The project is in the global shard; done
    return { project: globalProject as WithId<Project>, projectShardId };
  }

  const systemRepo = getSystemRepo(undefined, projectShardId);
  const project = await systemRepo.readReference<Project>(projectReference);
  return { project, projectShardId };
}
