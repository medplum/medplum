import { Operator } from '@medplum/core';
import { BundleEntry, Project, ProjectMembership } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { systemRepo } from '../fhir/repo';

/**
 * Verifies that the current user is a project admin.
 * Assumes that "projectId" is a path parameter.
 * Assumes that res.locals.user is populated by authenticateToken middleware.
 * @param req The request.
 * @param res The response.
 * @returns Project details if the current user is a project admin; undefined otherwise.
 */
export async function verifyProjectAdmin(req: Request, res: Response): Promise<Project | undefined> {
  const { projectId } = req.params;

  const project = await systemRepo.readResource<Project>('Project', projectId);

  const bundle = await systemRepo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    count: 1,
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: 'Project/' + projectId,
      },
      {
        code: 'user',
        operator: Operator.EQUALS,
        value: res.locals.membership.user.reference,
      },
    ],
  });

  if (bundle.entry?.length === 0) {
    return undefined;
  }

  const membership = bundle.entry?.[0].resource as ProjectMembership;
  if (!membership.admin) {
    return undefined;
  }

  return project;
}

/**
 * Returns the list of project memberships for the specified project.
 * @param projectId The project ID.
 * @returns The list of project memberships.
 */
export async function getProjectMemberships(projectId: string): Promise<ProjectMembership[]> {
  const bundle = await systemRepo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    count: 1000,
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: 'Project/' + projectId,
      },
    ],
  });
  return (bundle.entry as BundleEntry<ProjectMembership>[]).map((entry) => entry.resource as ProjectMembership);
}
