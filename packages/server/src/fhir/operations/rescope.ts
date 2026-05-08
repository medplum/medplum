// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  createReference,
  forbidden,
  getReferenceString,
  OperationOutcomeError,
  Operator,
  parseReference,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Project, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { getAuthenticatedContext } from '../../context';
import { getGlobalSystemRepo } from '../repo';
import { parseInputParameters } from './utils/parameters';

const op: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'user-rescope',
  status: 'active',
  kind: 'operation',
  code: 'rescope',
  experimental: true,
  system: false,
  type: false,
  instance: true,
  resource: ['User'],
  parameter: [
    {
      use: 'in',
      name: 'scope',
      type: 'code',
      min: 1,
      max: '1',
      documentation: 'Target scope for the User: "project" or "global"',
    },
    {
      use: 'in',
      name: 'project',
      type: 'Reference',
      min: 0,
      max: '1',
      documentation: 'The Project to scope the User to. Required when scope is "project".',
    },
    {
      use: 'out',
      name: 'return',
      type: 'User',
      min: 1,
      max: '1',
      documentation: 'The updated User resource',
    },
  ],
};

type RescopeParams = {
  scope: 'project' | 'global';
  project?: Reference<Project>;
};

export async function userRescopeOperation(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<RescopeParams>(op, req);
  const userId = req.params.id;

  if (!userId) {
    return [badRequest('Operation must be called on a specific User')];
  }

  if (!['project', 'global'].includes(params.scope)) {
    return [badRequest('Invalid scope: must be "project" or "global"')];
  }

  // Promoting a User to project scope (or moving between projects) requires super admin.
  // Demoting to global scope allows a project admin as long as they have write access to the User.
  const rescopeToProjectAllowed = ctx.project.superAdmin;
  const rescopeToGlobalAllowed = ctx.project.superAdmin || ctx.membership.admin;
  if (
    (params.scope === 'project' && !rescopeToProjectAllowed) ||
    (params.scope === 'global' && !rescopeToGlobalAllowed)
  ) {
    return [forbidden];
  }
  if (params.scope === 'project' && !params.project?.reference) {
    return [badRequest('Missing required "project" reference for scope "project"')];
  }

  // Basic sanity check validation completed at this point, attempt to rescope the user
  let updated: WithId<User>;
  if (params.scope === 'project') {
    updated = await rescopeUserToProject(ctx, userId, params);
  } else {
    updated = await rescopeUserToGlobal(ctx, userId);
  }
  return [allOk, updated];
}

async function rescopeUserToProject(
  ctx: AuthenticatedRequestContext,
  userId: string,
  params: RescopeParams
): Promise<WithId<User>> {
  // First check that the caller has access to the given user via their access policy
  await ctx.repo.readResource('User', userId);

  const systemRepo = getGlobalSystemRepo();
  return systemRepo.withTransaction(async () => {
    const user = await systemRepo.readResource<User>('User', userId);

    const [resourceType, projectId] = parseReference(params.project);
    if (!projectId || resourceType !== 'Project') {
      throw new OperationOutcomeError(badRequest('Invalid project reference'));
    }

    // Verify the target project exists.
    const targetProject = await systemRepo.readResource<Project>('Project', projectId);
    const targetRef = createReference(targetProject);

    if (user.project?.reference === targetRef.reference) {
      throw new OperationOutcomeError(badRequest('User is already scoped to this project'));
    }

    // Ensure the User has no ProjectMembership outside the target project.
    // Owning a User in one project while they hold memberships in others would
    // leave those other projects with references they cannot administer.
    const memberships = await systemRepo.searchResources<ProjectMembership>({
      resourceType: 'ProjectMembership',
      count: 2,
      filters: [
        { code: 'user', operator: Operator.EQUALS, value: getReferenceString(user) },
        { code: 'project', operator: Operator.NOT_EQUALS, value: targetRef.reference },
      ],
    });
    if (memberships.length > 0) {
      throw new OperationOutcomeError(
        badRequest('User has ProjectMembership in another project; remove those memberships before rescoping')
      );
    }

    return systemRepo.updateResource({
      ...user,
      meta: { ...user.meta, project: targetProject.id },
      project: targetRef,
    });
  });
}

async function rescopeUserToGlobal(ctx: AuthenticatedRequestContext, userId: string): Promise<WithId<User>> {
  const callerIsSuperAdmin = ctx.project.superAdmin;

  // First check that the caller has access to the given user via their access policy
  await ctx.repo.readResource('User', userId);

  const systemRepo = getGlobalSystemRepo();
  return systemRepo.withTransaction(async () => {
    const user = await systemRepo.readResource<User>('User', userId);
    if (!user.project) {
      throw new OperationOutcomeError(badRequest('User is already global-scoped'));
    }

    // Verify the caller has write access to this User: super admin, or project admin
    // of the project the User currently belongs to.
    if (!callerIsSuperAdmin && user.project.reference !== getReferenceString(ctx.project)) {
      throw new OperationOutcomeError(forbidden);
    }

    const { project: _project, ...userWithoutProject } = user;
    const { project: _metaProject, ...metaWithoutProject } = user.meta ?? {};
    return systemRepo.updateResource({
      ...userWithoutProject,
      meta: metaWithoutProject,
    });
  });
}
