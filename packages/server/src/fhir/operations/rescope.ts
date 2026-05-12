// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  AccessPolicyInteraction,
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
import assert from 'node:assert';
import type { AuthenticatedRequestContext } from '../../context';
import { getAuthenticatedContext } from '../../context';
import { parseInputParameters } from './utils/parameters';

export const operation: OperationDefinition = {
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
      documentation: 'Target scope for the User: "project" or "server"',
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
  scope: 'project' | 'server';
  project?: Reference<Project>;
};

export async function userRescopeOperation(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<RescopeParams>(operation, req);
  const userId = req.params.id;

  if (!userId) {
    return [badRequest('Operation must be called on a specific User')];
  }

  if (!['project', 'server'].includes(params.scope)) {
    return [badRequest('Invalid scope: must be "project" or "server"')];
  }

  let projectId: string | undefined = undefined;

  if (params.scope === 'project') {
    if (!params.project) {
      return [badRequest('Missing required "project" reference for scope "project"')];
    }
    const [resourceType, parsedProjectId] = parseReference(params.project);
    if (!parsedProjectId || resourceType !== 'Project') {
      return [badRequest('Invalid project reference')];
    }
    projectId = parsedProjectId;
  }

  // Test if this caller can actually read the user resource
  // The read will throw NOT FOUND if user does not have permissions
  const user = await ctx.repo.readResource<User>('User', userId);

  if (!(await isCallerAllowedToRescopeUser(ctx, user, params))) {
    return [forbidden];
  }

  // Basic sanity check validation completed at this point, attempt to rescope the user.
  // The two paths below are intentionally kept separate: promoting a User into a Project
  // and demoting one to server scope have different invariants, different authorization,
  // and different failure modes.
  let updated: WithId<User>;
  if (params.scope === 'project') {
    // We know this is defined because we would return bad request earlier if not
    assert(projectId);
    updated = await rescopeUserToProject(ctx, user, projectId);
  } else {
    updated = await rescopeUserToServer(ctx, user);
  }

  return [allOk, updated];
}

async function isCallerAllowedToRescopeUser(
  ctx: AuthenticatedRequestContext,
  user: WithId<User>,
  params: RescopeParams
): Promise<boolean> {
  const sufficientRoleForProjectRescope = ctx.project.superAdmin;
  const sufficientRoleForServerRescope = ctx.project.superAdmin || ctx.membership.admin;

  if (
    (params.scope === 'project' && !sufficientRoleForProjectRescope) ||
    (params.scope === 'server' && !sufficientRoleForServerRescope)
  ) {
    return false;
  }

  // Caller needs UPDATE perms for the user
  if (!ctx.repo.canPerformInteraction(AccessPolicyInteraction.UPDATE, user)) {
    return false;
  }

  // Project -> server when caller is project admin requires a check to make sure the project admin's project matches the user's project
  if (
    params.scope === 'server' &&
    !ctx.project.superAdmin &&
    user.project?.reference !== getReferenceString(ctx.project)
  ) {
    return false;
  }

  return true;
}

/**
 * Promote a User into a Project (or move between Projects). Super-admin only.
 * Validates the target Project, rejects no-op moves, and forbids the move if the
 * User holds ProjectMemberships in any other Project.
 * @param ctx - The authenticated request context for the caller.
 * @param user - The User being rescoped.
 * @param projectId - The target project ID to scope the user to.
 * @returns The updated User scoped to the target project.
 */
async function rescopeUserToProject(
  ctx: AuthenticatedRequestContext,
  user: WithId<User>,
  projectId: string
): Promise<WithId<User>> {
  const systemRepo = ctx.systemRepo;

  if (user.project?.reference === `Project/${projectId}`) {
    throw new OperationOutcomeError(badRequest('User is already scoped to this project'));
  }

  // Verify the target project exists.
  const targetProject = await systemRepo.readResource<Project>('Project', projectId);
  const targetRef = createReference(targetProject);

  return systemRepo.withTransaction(
    async () => {
      // We re-read the User to make sure we have the most up-to-date version
      const rereadUser = await systemRepo.readResource<User>('User', user.id);

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
        ...rereadUser,
        meta: { ...rereadUser.meta, project: targetProject.id },
        project: targetRef,
      });
    },
    { serializable: true } // We need serializable here since if a new project membership is added for this user, we want this tx to fail
  );
}

/**
 * Demote a User to server scope. Allowed for super admins, or for project admins
 * who administer the project the User currently belongs to. Rejects if the User
 * is already server-scoped.
 * @param ctx - The authenticated request context for the caller.
 * @param user - The User being rescoped.
 * @returns The updated User with project scope removed.
 */
async function rescopeUserToServer(ctx: AuthenticatedRequestContext, user: WithId<User>): Promise<WithId<User>> {
  const systemRepo = ctx.systemRepo;

  return systemRepo.withTransaction(async () => {
    const rereadUser = await systemRepo.readResource<User>('User', user.id);
    if (!rereadUser.project) {
      throw new OperationOutcomeError(badRequest('User is already server-scoped'));
    }

    delete rereadUser.project;
    delete rereadUser.meta?.project;

    return systemRepo.updateResource(rereadUser);
  });
}
