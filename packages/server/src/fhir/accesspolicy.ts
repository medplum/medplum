import { ProfileResource, createReference, projectAdminResourceTypes, resolveId } from '@medplum/core';
import {
  AccessPolicy,
  AccessPolicyIpAccessRule,
  AccessPolicyResource,
  Project,
  ProjectMembership,
  ProjectMembershipAccess,
  Reference,
} from '@medplum/fhirtypes';
import { AuthState } from '../oauth/middleware';
import { Repository, getSystemRepo } from './repo';
import { applySmartScopes } from './smart';

/**
 * Creates a repository object for the user auth state.
 * Individual instances of the Repository class manage access rights to resources.
 * Login instances contain details about user compartments.
 * This method ensures that the repository is setup correctly.
 * @param authState - The authentication state.
 * @param extendedMode - Optional flag to enable extended mode for custom Medplum properties.
 * @returns A repository configured for the login details.
 */
export async function getRepoForLogin(authState: AuthState, extendedMode?: boolean): Promise<Repository> {
  const { project, login, membership } = authState;
  const accessPolicy = await getAccessPolicyForLogin(authState);

  let allowedProjects: string[] | undefined;
  if (project.id) {
    allowedProjects = [project.id];
  }
  if (project.link && allowedProjects?.length) {
    for (const link of project.link) {
      allowedProjects.push(resolveId(link.project) as string);
    }
  }

  return new Repository({
    projects: allowedProjects,
    currentProject: project,
    author: membership.profile as Reference,
    remoteAddress: login.remoteAddress,
    superAdmin: project.superAdmin,
    projectAdmin: membership.admin,
    accessPolicy,
    strictMode: project.strictMode,
    extendedMode,
    checkReferencesOnWrite: project.checkReferencesOnWrite,
    onBehalfOf: authState.onBehalfOf ? createReference(authState.onBehalfOf) : undefined,
  });
}

/**
 * Returns the access policy for the user auth state.
 * @param authState - The authentication state.
 * @returns The finalized access policy.
 */
export async function getAccessPolicyForLogin(authState: AuthState): Promise<AccessPolicy | undefined> {
  const { project, login } = authState;
  const membership = authState.onBehalfOfMembership ?? authState.membership;

  let accessPolicy = await buildAccessPolicy(membership);

  if (login.scope) {
    // If the login specifies SMART scopes,
    // then set the access policy to use those scopes
    accessPolicy = applySmartScopes(accessPolicy, login.scope);
  }

  // Apply project admin access policies
  // This includes ensuring no admin rights for non-admins
  // and restricted access for admins
  accessPolicy = applyProjectAdminAccessPolicy(project, membership, accessPolicy);

  return accessPolicy;
}

/**
 * Builds a parameterized compound access policy.
 * @param membership - The user project membership.
 * @returns The parameterized compound access policy.
 */
export async function buildAccessPolicy(membership: ProjectMembership): Promise<AccessPolicy> {
  let access: ProjectMembershipAccess[] = [];

  if (membership.accessPolicy) {
    access.push({ policy: membership.accessPolicy });
  }

  if (membership.access) {
    access = access.concat(membership.access);
  }

  const profile = membership.profile as Reference<ProfileResource>;
  let compartment: Reference | undefined = undefined;
  let resourcePolicies: AccessPolicyResource[] = [];
  let ipAccessRules: AccessPolicyIpAccessRule[] = [];
  for (const entry of access) {
    const replaced = await buildAccessPolicyResources(entry, profile);
    if (replaced.compartment) {
      compartment = replaced.compartment;
    }
    if (replaced.resource) {
      resourcePolicies = resourcePolicies.concat(replaced.resource);
    }
    if (replaced.ipAccessRule) {
      ipAccessRules = ipAccessRules.concat(replaced.ipAccessRule);
    }
  }

  if ((!membership.access || membership.access.length === 0) && !membership.accessPolicy) {
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
    ipAccessRule: ipAccessRules,
  };
}

/**
 * Reads an access policy and replaces all variables.
 * @param access - The access policy and parameters.
 * @param profile - The user profile.
 * @returns The AccessPolicy with variables resolved.
 */
async function buildAccessPolicyResources(
  access: ProjectMembershipAccess,
  profile: Reference<ProfileResource>
): Promise<AccessPolicy> {
  const systemRepo = getSystemRepo();
  const original = await systemRepo.readReference(access.policy as Reference<AccessPolicy>);
  const params = access.parameter || [];
  params.push({ name: 'profile', valueReference: profile });
  if (!params.find((p) => p.name === 'patient')) {
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
    if (!resourcePolicies.find((r) => r.resourceType === resourceType)) {
      resourcePolicies.push({
        resourceType,
        readonly: true,
      });
    }
  }
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
  accessPolicy: AccessPolicy
): AccessPolicy {
  if (project.superAdmin) {
    // If the user is a super admin, then do not apply any additional access policy rules.
    return accessPolicy;
  }

  if (accessPolicy) {
    // If there is an existing access policy
    // Remove any references to project admin resource types
    accessPolicy.resource = accessPolicy.resource?.filter(
      (r) => !projectAdminResourceTypes.includes(r.resourceType as string)
    );
  }

  if (membership.admin) {
    // If the user is a project admin,
    // then grant limited access to the project admin resource types
    if (!accessPolicy) {
      accessPolicy = { resourceType: 'AccessPolicy' };
    }

    if (!accessPolicy.resource) {
      accessPolicy.resource = [{ resourceType: '*' }];
    }

    accessPolicy.resource.push({
      resourceType: 'Project',
      criteria: `Project?_id=${resolveId(membership.project)}`,
      readonlyFields: ['superAdmin', 'features', 'link', 'systemSetting'],
      hiddenFields: ['systemSecret', 'strictMode'],
    });

    accessPolicy.resource.push({
      resourceType: 'ProjectMembership',
      criteria: `ProjectMembership?project=${membership.project?.reference}`,
      readonlyFields: ['project', 'user'],
    });

    accessPolicy.resource.push({
      resourceType: 'PasswordChangeRequest',
      readonly: true,
    });

    accessPolicy.resource.push({
      resourceType: 'UserSecurityRequest',
      readonly: true,
    });

    accessPolicy.resource.push({
      resourceType: 'User',
      criteria: `User?project=${membership.project?.reference}`,
      hiddenFields: ['passwordHash', 'mfaSecret'],
      readonlyFields: ['email', 'emailVerified', 'mfaEnrolled', 'project'],
    });
  }

  return accessPolicy;
}
