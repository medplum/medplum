import { forbidden, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import { BundleEntry, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { NextFunction, Request, Response } from 'express';
import { systemRepo } from '../fhir/repo';

/**
 * Verifies that the current user is a project admin.
 * Assumes that "projectId" is a path parameter.
 * Assumes that res.locals.user is populated by authenticateToken middleware.
 * @param req The request.
 * @param res The response.
 * @param next The next handler function.
 */
export async function verifyProjectAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const locals = res.locals;
  const project = locals.project as Project;
  const user = locals.membership.user as Reference<User>;

  const bundle = await systemRepo.search<ProjectMembership>({
    resourceType: 'ProjectMembership',
    count: 1,
    filters: [
      {
        code: 'project',
        operator: Operator.EQUALS,
        value: getReferenceString(project),
      },
      {
        code: 'user',
        operator: Operator.EQUALS,
        value: user.reference as string,
      },
    ],
  });

  if (bundle.entry?.length === 0) {
    next(new OperationOutcomeError(forbidden));
    return;
  }

  const membership = bundle.entry?.[0].resource as ProjectMembership;
  if (!membership.admin) {
    next(new OperationOutcomeError(forbidden));
    return;
  }

  next();
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
