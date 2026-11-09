// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  EMPTY,
  getReferenceString,
  isNotFound,
  isResource,
  isString,
  OperationOutcomeError,
  parseSearchRequest,
  projectAdminResourceTypes,
  readInteractions,
  resolveId,
  wildcardExcludedResourceTypes,
} from '@medplum/core';
import type {
  AccessPolicy,
  AccessPolicyIpAccessRule,
  AccessPolicyResource,
  Bot,
  ClientApplication,
  Expression,
  Project,
  ProjectMembership,
  ProjectMembershipAccess,
  Reference,
} from '@medplum/fhirtypes';
import { getLogger } from '../logger';
import type { AuthState } from '../oauth/middleware';
import { membershipProfileTypes, readMembershipReference } from './projectmembership';
import type { SystemRepository } from './repo';
import { getGlobalSystemRepo, getProjectSystemRepo, Repository } from './repo';
import { PLACEHOLDER_SHARD_ID } from './sharding';
import { applySmartScopes, parseSmartScopes } from './smart';

export type PopulatedAccessPolicy = AccessPolicy & { resource: AccessPolicyResource[] };

/**
 * Creates a repository object for the user auth state.
 * Individual instances of the Repository class manage access rights to resources.
 * Login instances contain details about user compartments.
 * This method ensures that the repository is setup correctly.
 * @param authState - The authentication state.
 * @param extendedMode - Optional flag to enable extended mode for custom Medplum properties.
 * @param remoteAddress - Optional current request IP, used for AuditEvents instead of `login.remoteAddress`
 *   (which is only as fresh as the last token issuance/refresh).
 * @returns A repository configured for the login details.
 */
export async function getRepoForLogin(
  authState: AuthState,
  extendedMode?: boolean,
  remoteAddress?: string
): Promise<Repository> {
  const { login, membership: realMembership, onBehalfOfMembership, project: realProject } = authState;
  const membership = onBehalfOfMembership ?? realMembership;
  const accessPolicy = await getAccessPolicyForLogin(authState);

  let profile: WithId<ProfileResource | Bot | ClientApplication> | undefined = authState.profile;
  if (!profile) {
    try {
      // project system repo since not all ProfileResource types are global
      const realProjectSystemRepo = await getProjectSystemRepo(realProject);
      profile = await readMembershipReference<ProfileResource | Bot | ClientApplication>(
        realProjectSystemRepo,
        realMembership,
        realMembership.profile,
        membershipProfileTypes,
        { allowLinkedProjects: true }
      );
    } catch (err: unknown) {
      if (!(err instanceof OperationOutcomeError && isNotFound(err.outcome))) {
        throw err;
      }
    }
  }

  let project = realProject;
  let globalSystemRepo: SystemRepository | undefined;
  if (membership.project.reference !== realMembership.project.reference) {
    globalSystemRepo = getGlobalSystemRepo();
    project = await globalSystemRepo.readReference<Project>(membership.project);
  }

  const allowedProjects = await getAllowedProjects(project, globalSystemRepo);

  return new Repository({
    routing: { kind: 'project-shard', shardId: PLACEHOLDER_SHARD_ID },
    projects: allowedProjects,
    author: profile ? createReference(profile) : realMembership.profile,
    remoteAddress: remoteAddress ?? login.remoteAddress,
    superAdmin: project.superAdmin,
    projectAdmin: membership.admin,
    accessPolicy,
    strictMode: project.strictMode,
    extendedMode,
    checkReferencesOnWrite: project.checkReferencesOnWrite,
    validateTerminology: project.features?.includes('validate-terminology'),
    onBehalfOf: authState.onBehalfOf ? createReference(authState.onBehalfOf) : undefined,
    client: login.client,
  });
}

/**
 * Creates a repository that is limited to what a project may read: the project itself and the projects it links to.
 *
 * Use this instead of a `SystemRepository` to resolve references found in project content when there is
 * no user to act as, such as in unauthenticated endpoints and background jobs.
 * A `SystemRepository` can read every resource in every project, so it authorizes nothing.
 * @param projectId - The ID of the project.
 * @returns A repository scoped to the project.
 */
export async function getRepoForProject(projectId: string): Promise<Repository> {
  const globalSystemRepo = getGlobalSystemRepo();
  const project = await globalSystemRepo.readResource<Project>('Project', projectId);
  return getRepoForProjects(await getAllowedProjects(project, globalSystemRepo));
}

/**
 * Creates a repository that is limited to reading from the given projects, as in `getRepoForProject`.
 * @param projects - The current project, followed by any linked projects it may read from.
 * @returns A repository scoped to the projects.
 */
export function getRepoForProjects(projects: WithId<Project>[]): Repository {
  return new Repository({
    routing: { kind: 'project-shard', shardId: PLACEHOLDER_SHARD_ID },
    projects,
    author: { reference: 'system' },
    extendedMode: true,
  });
}

/**
 * Resolves a project and the projects it links to, which its members may read from.
 * @param project - The project whose links to resolve.
 * @param systemRepo - Optional system repository used to read projects
 * @returns The project followed by each linked project that could be read.
 */
export async function getAllowedProjects(
  project: WithId<Project>,
  systemRepo?: SystemRepository
): Promise<WithId<Project>[]> {
  const allowedProjects: WithId<Project>[] = [project];
  if (project.link) {
    const linkedProjectRefs: Reference<Project>[] = [];
    for (const link of project.link) {
      if (link.project) {
        linkedProjectRefs.push(link.project);
      }
    }

    const linkedProjectsOrError = await (systemRepo ?? getGlobalSystemRepo()).readReferences<Project>(
      linkedProjectRefs
    );
    for (let i = 0; i < linkedProjectsOrError.length; i++) {
      const linkedProjectOrError = linkedProjectsOrError[i];
      if (isResource(linkedProjectOrError)) {
        allowedProjects.push(linkedProjectOrError);
      } else {
        // Ignore missing; if a super admin creates a project link to a non-existent project,
        // searching it would be a no-op.
        getLogger().debug('Linked project not found', { project: linkedProjectRefs[i] });
      }
    }
  }
  return allowedProjects;
}

/**
 * Returns the access policy for the user auth state.
 * @param authState - The authentication state.
 * @returns The finalized access policy.
 */
export async function getAccessPolicyForLogin(authState: AuthState): Promise<AccessPolicy | undefined> {
  const { project, login } = authState;
  if (project.superAdmin && (login.launch || parseSmartScopes(login.scope).length > 0)) {
    // Super admin privileges are not limited by the access policy, so SMART scopes cannot narrow them
    throw new OperationOutcomeError(badRequest('SMART scopes are not supported for super admin logins'));
  }

  const membership = authState.onBehalfOfMembership ?? authState.membership;

  let accessPolicy = await buildAccessPolicy(membership);

  // Apply project admin access policies
  // This includes ensuring no admin rights for non-admins
  // and restricted access for admins
  accessPolicy = applyProjectAdminAccessPolicy(project, membership, accessPolicy);

  if (login.scope) {
    // If the login specifies SMART scopes,
    // then set the access policy to use those scopes.
    // Applied last so that the scopes also limit the project admin rules.
    accessPolicy = applySmartScopes(accessPolicy, authState);
  }

  return accessPolicy;
}

/**
 * Builds a parameterized compound access policy.
 * @param membership - The user project membership.
 * @returns The parameterized compound access policy.
 */
export async function buildAccessPolicy(membership: ProjectMembership): Promise<PopulatedAccessPolicy> {
  const access: ProjectMembershipAccess[] = [];
  if (membership.accessPolicy) {
    access.push({ policy: membership.accessPolicy });
  }
  if (membership.access) {
    access.push(...membership.access);
  }

  const systemRepo = await getProjectSystemRepo(membership.project);
  let compartment: Reference | undefined = undefined;
  const resourcePolicies: AccessPolicyResource[] = [];
  const ipAccessRules: AccessPolicyIpAccessRule[] = [];
  const accessPolicyMap = new Map<string, AccessPolicy>();
  for (const entry of access) {
    const replaced = await buildAccessPolicyResources(
      systemRepo,
      membership,
      entry,
      membership.profile as Reference<ProfileResource>,
      accessPolicyMap
    );
    if (replaced.compartment) {
      compartment = replaced.compartment;
    }
    for (const resourcePolicy of replaced.resource ?? EMPTY) {
      if (!resourcePolicy.interaction && resourcePolicy.readonly) {
        resourcePolicy.interaction = ['search', 'read', 'history', 'vread'];
      }
      normalizeOperations(resourcePolicy);
      applyServerWriteRules(resourcePolicy);
      resourcePolicies.push(resourcePolicy);
    }
    if (replaced.ipAccessRule) {
      ipAccessRules.push(...replaced.ipAccessRule);
    }
  }

  if (!membership?.access?.length && !membership.accessPolicy) {
    // Preserve legacy behavior of null access policy
    // TODO: This should be removed in future release when access policies are required
    resourcePolicies.push({ resourceType: '*' });
  }

  addDefaultResourceTypes(resourcePolicies);

  return {
    resourceType: 'AccessPolicy',
    basedOn: access.map((a) => a.policy),
    compartment,
    resource: resourcePolicies,
    ipAccessRule: ipAccessRules.length ? ipAccessRules : undefined,
  };
}

/**
 * Write rules the server adds to every access policy entry for a resource type.
 *
 * The repository applies `readonlyFields` and `writeConstraint` from the first entry that matches a write, so the
 * rules go on each entry. Repositories without an access policy are not bound by them, which is how server code
 * writes the fields these rules protect.
 */
const serverWriteRules: Record<string, Pick<AccessPolicyResource, 'readonlyFields' | 'writeConstraint'>> = {
  EncryptedSecret: {
    // Written only by $set-value
    readonlyFields: ['encryptedValue'],
    writeConstraint: [
      {
        // owner is bound into the encryption context and matched by %profile criteria, so it must be literal
        language: 'text/fhirpath',
        expression: `owner.empty() or owner.reference.matches('^[A-Za-z]+/[A-Za-z0-9.-]{1,64}$')`,
      },
      {
        // owner and code are bound into the encryption context and may appear in get-value grant criteria
        language: 'text/fhirpath',
        expression:
          '%before.empty() or (code = %before.code and owner.reference.empty() = %before.owner.reference.empty() ' +
          'and (owner.reference.empty() or owner.reference = %before.owner.reference))',
      },
      {
        language: 'text/fhirpath',
        expression: `%before.empty() or %before.status != 'revoked'`,
      },
    ],
  },
};

/**
 * Adds the server's write rules for the entry's resource type to an access policy entry, in place.
 * @param resourcePolicy - The access policy entry.
 */
function applyServerWriteRules(resourcePolicy: AccessPolicyResource): void {
  const rules = serverWriteRules[resourcePolicy.resourceType];
  if (!rules) {
    return;
  }
  resourcePolicy.readonlyFields = [...(resourcePolicy.readonlyFields ?? EMPTY), ...(rules.readonlyFields ?? EMPTY)];
  resourcePolicy.writeConstraint = [...(resourcePolicy.writeConstraint ?? EMPTY), ...(rules.writeConstraint ?? EMPTY)];
}

/**
 * Search parameters that may appear in the criteria of an entry granting each operation.
 *
 * These operations release protected values, so their grants may only filter on elements that cannot change after
 * create. Otherwise anyone able to write the resource could edit it into a shape that matches someone else's grant.
 * Operations not listed here may use any criteria.
 */
const operationCriteriaParams: Record<string, string[]> = {
  'get-value': ['_id', 'owner', 'code'],
};

/**
 * Applies the server's rules for `operation` to an access policy entry, in place.
 *
 * - An entry that lists operations but no interactions grants no interactions. Otherwise an entry written to grant
 *   only an operation would, by the default for a missing `interaction`, also grant every interaction.
 * - An operation is removed from an entry whose criteria use search parameters that operation does not allow.
 * @param resourcePolicy - The access policy entry, after variables are replaced.
 */
function normalizeOperations(resourcePolicy: AccessPolicyResource): void {
  if (!resourcePolicy.operation) {
    return;
  }
  resourcePolicy.interaction ??= [];
  resourcePolicy.operation = resourcePolicy.operation.filter((operation) => {
    const allowed = operationCriteriaAllowed(resourcePolicy, operation);
    if (!allowed) {
      getLogger().warn('Access policy operation removed: criteria not allowed', {
        resourceType: resourcePolicy.resourceType,
        operation,
        criteria: resourcePolicy.criteria,
      });
    }
    return allowed;
  });
}

function operationCriteriaAllowed(resourcePolicy: AccessPolicyResource, operation: string): boolean {
  const allowedParams = operationCriteriaParams[operation];
  if (!allowedParams) {
    return true;
  }
  if (resourcePolicy.compartment) {
    return false;
  }
  if (!resourcePolicy.criteria) {
    return true;
  }
  // Chained and `_has` filters keep their full key as the code, so they never match an allowed parameter
  const filters = parseSearchRequest(resourcePolicy.criteria).filters ?? EMPTY;
  return filters.every((filter) => allowedParams.includes(filter.code));
}

/**
 * Reads an access policy and replaces all variables.
 * @param systemRepo - The system repository.
 * @param membership - The project membership that references the access policy.
 * @param access - The access policy and parameters.
 * @param profile - The user profile.
 * @param accessPolicyMap - Map of already-fetched access policies to avoid redundant lookups.
 * @returns The AccessPolicy with variables resolved.
 */
async function buildAccessPolicyResources(
  systemRepo: SystemRepository,
  membership: ProjectMembership,
  access: ProjectMembershipAccess,
  profile: Reference<ProfileResource>,
  accessPolicyMap: Map<string, AccessPolicy>
): Promise<AccessPolicy> {
  const accessPolicyReference = access.policy;
  const policyReferenceString = getReferenceString(accessPolicyReference);
  if (!isString(policyReferenceString)) {
    throw new Error('Access policy reference is required');
  }

  let original = accessPolicyMap.get(policyReferenceString);
  if (!original) {
    try {
      original = await readMembershipReference(systemRepo, membership, accessPolicyReference, ['AccessPolicy'], {
        allowLinkedProjects: true,
      });
      accessPolicyMap.set(policyReferenceString, original);
    } catch {
      // Intentionally catch and rethrow with a generic error message for security
      // (don't expose access policy details during login)
      throw new OperationOutcomeError(
        badRequest(
          'Cannot authenticate: Invalid access policy configuration. Please contact your administrator to update your project membership.'
        )
      );
    }
  }

  const params = access.parameter || [];
  params.push({ name: 'profile', valueReference: profile });
  if (!params.some((p) => p.name === 'patient')) {
    params.push({ name: 'patient', valueReference: profile });
  }
  let json = JSON.stringify(original);
  for (const param of params) {
    if (param.valueString) {
      json = json.replaceAll(`%${param.name}`, param.valueString);
    } else if (param.valueReference) {
      json = json.replaceAll(`%${param.name}.id`, resolveId(param.valueReference) as string);
      json = json.replaceAll(`%${param.name}`, param.valueReference.reference as string);
    }
  }
  return JSON.parse(json) as AccessPolicy;
}

/**
 * Adds default resource types to the access policy.
 * Once upon a time, all users automatically had access to "system" resource types such as StructureDefinition.
 * But now, users must have explicit access to these resource types.
 * Unfortunately, there are many clients that depend on this behavior.
 * So, we add these resource types to the access policy if they are not already present.
 * @param resourcePolicies - The existing set of resource policies.
 */
function addDefaultResourceTypes(resourcePolicies: AccessPolicyResource[]): void {
  const defaultResourceTypes = ['SearchParameter', 'StructureDefinition'];
  for (const resourceType of defaultResourceTypes) {
    if (!resourcePolicies.some((r) => r.resourceType === resourceType)) {
      resourcePolicies.push({
        resourceType,
        readonly: true,
      });
    }
  }
}

/**
 * Returns a write constraint that requires a new resource's `project` element, if present, to be the admin's own Project.
 * Updates are covered by `readonlyFields`, which restores `project` from the previous version.
 * @param membership - The project admin's membership.
 * @returns The write constraint expression.
 */
function ownProjectWriteConstraint(membership: ProjectMembership): Expression {
  return {
    language: 'text/fhirpath',
    expression: `%before.exists() or project.empty() or project.reference = 'Project/${resolveId(membership.project)}'`,
  };
}

/**
 * Updates the access policy to include project admin rules.
 * This includes ensuring no admin rights for non-admins and restricted access for admins.
 * @param project - The project.
 * @param membership - The active project membership.
 * @param accessPolicy - The existing access policy.
 * @returns Updated access policy with all project admin rules applied.
 */
function applyProjectAdminAccessPolicy(
  project: Project,
  membership: ProjectMembership,
  accessPolicy: PopulatedAccessPolicy
): PopulatedAccessPolicy {
  if (project.superAdmin) {
    for (const resourceType of wildcardExcludedResourceTypes) {
      if (!accessPolicy.resource.some((r) => r.resourceType === resourceType)) {
        accessPolicy.resource.push({ resourceType });
      }
    }
  } else if (membership.admin) {
    // If the user is a project admin,
    // then grant limited access to the project admin resource types
    accessPolicy.resource = accessPolicy.resource?.filter((r) => !projectAdminResourceTypes.includes(r.resourceType));

    // Project admins can edit their own project
    accessPolicy.resource.push(
      {
        resourceType: 'AccessPolicy',
        criteria: `AccessPolicy?_project=${resolveId(membership.project)}`,
      },
      {
        // Project admins have full access to their own project, except for a few sensitive fields
        resourceType: 'Project',
        criteria: `Project?_id=${resolveId(membership.project)}`,
        readonlyFields: ['active', 'features', 'link', 'systemSetting'],
        hiddenFields: ['superAdmin', 'systemSecret', 'strictMode'],
        interaction: ['read', 'vread', 'update', 'history', 'create', 'search'], // Everything except delete
      },
      {
        // Project admins have read-only access to linked projects, and cannot see sensitive fields
        resourceType: 'Project',
        hiddenFields: ['superAdmin', 'setting', 'systemSetting', 'secret', 'systemSecret', 'strictMode'],
        interaction: ['read', 'vread', 'history', 'search'], // Read-only access to linked projects
      },
      {
        resourceType: 'ProjectMembership',
        criteria: `ProjectMembership?_project=${resolveId(membership.project)}`,
        readonlyFields: ['project', 'user'],
        writeConstraint: [ownProjectWriteConstraint(membership)],
      },
      {
        resourceType: 'UserSecurityRequest',
        criteria: `UserSecurityRequest?_project=${resolveId(membership.project)}`,
        readonly: true,
      },
      {
        resourceType: 'User',
        criteria: `User?_project=${resolveId(membership.project)}`,
        hiddenFields: ['passwordHash', 'mfaSecret'],
        readonlyFields: ['email', 'emailVerified', 'mfaEnrolled', 'project'],
        writeConstraint: [ownProjectWriteConstraint(membership)],
      },
      {
        resourceType: 'Cron',
        criteria: `Cron?_project=${resolveId(membership.project)}`,
      },
      {
        resourceType: 'Package',
        readonly: true,
      },
      {
        resourceType: 'PackageRelease',
        readonly: true,
      },
      {
        resourceType: 'PackageInstallation',
        readonly: true,
      }
    );
  } else {
    // Preserve policy reads, including wildcard grants, but never grant non-admins policy writes.
    const policyReadRules = accessPolicy.resource
      .filter((r) => r.resourceType === 'AccessPolicy' || r.resourceType === '*')
      .map((r) => ({
        ...r,
        resourceType: 'AccessPolicy',
        criteria: r.criteria?.replace(/^\*\?/, 'AccessPolicy?'),
        interaction: r.interaction?.filter((i) => readInteractions.includes(i)) ?? [...readInteractions],
      }));

    accessPolicy.resource = accessPolicy.resource.filter((r) => !projectAdminResourceTypes.includes(r.resourceType));
    accessPolicy.resource.push(...policyReadRules);
  }

  return accessPolicy;
}
