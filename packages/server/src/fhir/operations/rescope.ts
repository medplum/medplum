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
  const params = parseInputParameters<RescopeParams>(operation, req);
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

  // Basic sanity check validation completed at this point, attempt to rescope the user.
  // The two paths below are intentionally kept separate: promoting a User into a Project
  // and demoting one to global scope have different invariants, different authorization,
  // and different failure modes. Only the shared scaffolding (caller access check +
  // system-repo transaction + re-read of the User) is factored out via withRescopeTxn.
  const updated =
    params.scope === 'project'
      ? await rescopeUserToProject(ctx, userId, params)
      : await rescopeUserToGlobal(ctx, userId);
  return [allOk, updated];
}

/**
 * Shared scaffolding for both rescope paths. Performs the caller's access-policy check
 * against the User, then opens a system-repo transaction and re-reads the User so the
 * path-specific `mutate` callback operates on a consistent view.
 *
 * This helper deliberately does NOT encode any rescoping logic — both paths supply
 * their own distinct validation and mutation in the callback.
 * @param ctx - The authenticated request context for the caller.
 * @param userId - The id of the User being rescoped.
 * @param mutate - Callback invoked inside the system-repo transaction with the
 *   re-read User and the system repo; returns the updated User.
 * @returns The updated User as returned by the mutate callback.
 */
async function withRescopeTxn(
  ctx: AuthenticatedRequestContext,
  userId: string,
  mutate: (user: WithId<User>, systemRepo: ReturnType<typeof getGlobalSystemRepo>) => Promise<WithId<User>>
): Promise<WithId<User>> {
  await ctx.repo.readResource('User', userId);
  const systemRepo = getGlobalSystemRepo();
  return systemRepo.withTransaction(
    async () => {
      const user = await systemRepo.readResource<User>('User', userId);
      return mutate(user, systemRepo);
    },
    { serializable: true }
  );
}

/**
 * Promote a User into a Project (or move between Projects). Super-admin only.
 * Validates the target Project, rejects no-op moves, and forbids the move if the
 * User holds ProjectMemberships in any other Project.
 * @param ctx - The authenticated request context for the caller.
 * @param userId - The id of the User being rescoped.
 * @param params - The rescope parameters, including the target project reference.
 * @returns The updated User scoped to the target project.
 */
async function rescopeUserToProject(
  ctx: AuthenticatedRequestContext,
  userId: string,
  params: RescopeParams
): Promise<WithId<User>> {
  return withRescopeTxn(ctx, userId, async (user, systemRepo) => {
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

/**
 * Demote a User to global scope. Allowed for super admins, or for project admins
 * who administer the project the User currently belongs to. Rejects if the User
 * is already global-scoped.
 * @param ctx - The authenticated request context for the caller.
 * @param userId - The id of the User being rescoped.
 * @returns The updated User with project scope removed.
 */
async function rescopeUserToGlobal(ctx: AuthenticatedRequestContext, userId: string): Promise<WithId<User>> {
  const callerIsSuperAdmin = ctx.project.superAdmin;

  return withRescopeTxn(ctx, userId, async (user, systemRepo) => {
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
