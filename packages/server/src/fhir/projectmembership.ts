// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { Project, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { getGlobalSystemRepo } from './repo';

/**
 * Returns why a membership cannot be used, or undefined if it can.
 * As with Patient.active, a missing `active` means active.
 * @param project - The project.
 * @param membership - The membership, if there is one. Without it, only the project is checked.
 * @returns The reason the membership or project is inactive, or undefined if both are active.
 */
export function getInactiveReason(
  project: Project,
  membership?: ProjectMembership
): 'Profile not active' | 'Project not active' | undefined {
  if (membership?.active === false) {
    return 'Profile not active';
  }
  if (project.active === false) {
    return 'Project not active';
  }
  return undefined;
}

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
