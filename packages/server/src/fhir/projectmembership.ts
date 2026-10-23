// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, notFound, OperationOutcomeError, Operator, parseReference, resolveId } from '@medplum/core';
import type { Project, ProjectMembership, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import type { SystemRepository } from './repo';
import { getGlobalSystemRepo } from './repo';

export const membershipProfileTypes: readonly ResourceType[] = [
  'Bot',
  'ClientApplication',
  'Patient',
  'Practitioner',
  'RelatedPerson',
];

const projectlessMembershipReferenceTypes: readonly ResourceType[] = ['AccessPolicy', 'UserConfiguration'];

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

/**
 * Reads a resource referenced by a ProjectMembership, such as the profile, access policy, or user configuration.
 *
 * Membership references are followed with a system repository, so this verifies that the target is one of
 * the expected resource types and belongs to the membership's project (or a linked project, if allowed).
 * Always use this function instead of reading membership references directly.
 * @param systemRepo - The system repository.
 * @param membership - The project membership that holds the reference.
 * @param reference - The reference to read.
 * @param allowedTypes - The resource types the reference may point to.
 * @param allowLinkedProjects - Whether the target may belong to a project linked from the membership's project.
 * @returns The referenced resource.
 */
export async function readMembershipReference<T extends Resource>(
  systemRepo: SystemRepository,
  membership: ProjectMembership,
  reference: Reference<T>,
  allowedTypes: readonly ResourceType[],
  allowLinkedProjects = false
): Promise<WithId<T>> {
  let resourceType: string;
  try {
    [resourceType] = parseReference(reference);
  } catch {
    throw new OperationOutcomeError(badRequest('Invalid reference'));
  }
  if (!allowedTypes.includes(resourceType as ResourceType)) {
    throw new OperationOutcomeError(notFound);
  }

  const resource = await systemRepo.readReference<T>(reference);
  const resourceProjectId = resource.meta?.project;
  if (resourceProjectId && resourceProjectId === resolveId(membership.project)) {
    return resource;
  }

  // Only super admins can create resources without a project, such as shared access policies
  if (!resourceProjectId && projectlessMembershipReferenceTypes.includes(resource.resourceType)) {
    return resource;
  }

  if (allowLinkedProjects && resourceProjectId) {
    const project = await systemRepo.readReference<Project>(membership.project);
    if (project.link?.some((link) => resolveId(link.project) === resourceProjectId)) {
      return resource;
    }
  }

  throw new OperationOutcomeError(notFound);
}
