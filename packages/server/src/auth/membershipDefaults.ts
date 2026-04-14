// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource } from '@medplum/core';
import type { ParameterizedAccess, Project, ProjectMembership } from '@medplum/fhirtypes';

function cloneParameterizedAccessList(access: ParameterizedAccess[]): ParameterizedAccess[] {
  return access.map((a) => ({
    ...a,
    parameter: a.parameter?.map((p) => ({ ...p })),
  }));
}

/**
 * Default {@link ProjectMembership.accessPolicy} / {@link ProjectMembership.access}
 * when creating a membership without explicit access, from {@link Project.defaultAccessPolicy}
 * and legacy {@link Project.defaultPatientAccessPolicy} (Patient only).
 */
export function getDefaultMembershipAccessFields(
  project: Project,
  profileResourceType: ProfileResource['resourceType']
): Pick<ProjectMembership, 'accessPolicy' | 'access'> {
  const result: Pick<ProjectMembership, 'accessPolicy' | 'access'> = {};
  const entry = project.defaultAccessPolicy?.find((p) => p.resourceType === profileResourceType);
  if (entry?.access?.length) {
    result.access = cloneParameterizedAccessList(entry.access);
  }
  if (!result.access?.length && profileResourceType === 'Patient' && project.defaultPatientAccessPolicy) {
    result.accessPolicy = project.defaultPatientAccessPolicy;
  }
  return result;
}

/** True when open patient registration can resolve a default access policy for new Patient memberships. */
export function projectHasDefaultPatientAccess(project: Project): boolean {
  const d = getDefaultMembershipAccessFields(project, 'Patient');
  return d.accessPolicy !== undefined || (d.access !== undefined && d.access.length > 0);
}
