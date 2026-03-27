// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BackgroundJobContext, WithId } from '@medplum/core';
import { createReference, Operator } from '@medplum/core';
import type { Project, ProjectMembership, Resource } from '@medplum/fhirtypes';
import { getShardSystemRepo } from '../fhir/repo';
import { PLACEHOLDER_SHARD_ID } from '../fhir/sharding';
import { getLogger } from '../logger';

/**
 * Syncs ProjectMembership.project display names when a Project is renamed.
 *
 * @param resource - The resource that was created or updated.
 * @param previousVersion - The previous version of the resource, if available.
 * @param _context - The background job context.
 */
export async function syncProjectDisplayNames(
  resource: WithId<Resource>,
  previousVersion: Resource | undefined,
  _context: BackgroundJobContext
): Promise<void> {
  if (resource.resourceType !== 'Project') {
    return;
  }

  if (!previousVersion || (previousVersion as Project).name === (resource as Project).name) {
    return;
  }

  const project = resource as WithId<Project>;
  const freshRef = createReference(project);
  const systemRepo = getShardSystemRepo(PLACEHOLDER_SHARD_ID);

  const memberships = await systemRepo.searchResources<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: `Project/${project.id}`,
      },
    ],
  });

  for (const membership of memberships) {
    if (membership.project.display === freshRef.display) {
      continue;
    }
    try {
      await systemRepo.updateResource<ProjectMembership>({
        ...membership,
        project: freshRef,
      });
    } catch (err) {
      getLogger().error('Error syncing project display name on membership', {
        membershipId: membership.id,
        projectId: project.id,
        err,
      });
    }
  }
}
