// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { ProjectMembership, Reference } from '@medplum/fhirtypes';
import { getGlobalSystemRepo } from './repo';

/**
 * @param projectId - The ID of the project to search in.
 * @param profile - The profile to find a project membership for.
 * @throws An error whenever there are multiple project memberships for the given user.
 * @returns A promise that resolves to a `ProjectMembership` or `undefined` if no `ProjectMembership` found.
 */
export function findProjectMembership(
  projectId: string,
  profile: Reference
): Promise<WithId<ProjectMembership> | undefined> {
  const systemRepo = getGlobalSystemRepo();
  return systemRepo.searchOne<ProjectMembership>({
    resourceType: 'ProjectMembership',
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: `Project/${projectId}`,
      },
      {
        code: 'profile',
        operator: Operator.EQUALS,
        value: profile.reference as string,
      },
    ],
  });
}
