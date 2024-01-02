import { ProfileResource, projectAdminResourceTypes, resolveId } from '@medplum/core';
import {
  AccessPolicy,
  AccessPolicyIpAccessRule,
  AccessPolicyResource,
  Login,
  ProjectMembership,
  ProjectMembershipAccess,
  Reference,
} from '@medplum/fhirtypes';
import { Repository, systemRepo } from './repo';
import { applySmartScopes } from './smart';

/**
 * Creates a repository object for the user login object.
 * Individual instances of the Repository class manage access rights to resources.
 * Login instances contain details about user compartments.
 * This method ensures that the repository is setup correctly.
 * @param login - The user login.
 * @param membership - The active project membership.
 * @param strictMode - Optional flag to enable strict mode for in-depth FHIR schema validation.
 * @param extendedMode - Optional flag to enable extended mode for custom Medplum properties.
 * @param checkReferencesOnWrite - Optional flag to enable reference checking on write.
 * @returns A repository configured for the login details.
 */
export async function getRepoForLogin(
  login: Login,
  membership: ProjectMembership,
  strictMode?: boolean,
  extendedMode?: boolean,
  checkReferencesOnWrite?: boolean
): Promise<Repository> {
  const accessPolicy = await getAccessPolicyForLogin(login, membership);

  return new Repository({
    project: resolveId(membership.project) as string,
    author: membership.profile as Reference,
    remoteAddress: login.remoteAddress,
    superAdmin: login.superAdmin,
    projectAdmin: membership.admin,
    accessPolicy,
    strictMode,
    extendedMode,
    checkReferencesOnWrite,
  });
}

/**
 * Returns the access policy for the login.
 * @param login - The user login.
 * @param membership - The user membership.
 * @returns The finalized access policy.
 */
export async function getAccessPolicyForLogin(
  login: Login,
  membership: ProjectMembership
): Promise<AccessPolicy | undefined> {
  let accessPolicy: AccessPolicy | undefined = undefined;

  if (membership.access || membership.accessPolicy) {
    accessPolicy = await buildAccessPolicy(membership);
  }

  if (login.scope) {
    // If the login specifies SMART scopes,
    // then set the access policy to use those scopes
    accessPolicy = applySmartScopes(accessPolicy, login.scope);
  }

  // Apply project admin access policies
  // This includes ensuring no admin rights for non-admins
  // and restricted access for admins
  accessPolicy = applyProjectAdminAccessPolicy(login, membership, accessPolicy);

  return accessPolicy;
}

/**
 * Builds a parameterized compound access policy.
 * @param membership - The user project membership.
 * @returns The parameterized compound access policy.
 */
async function buildAccessPolicy(membership: ProjectMembership): Promise<AccessPolicy> {
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

  addDefaultResourceTypes(resourcePolicies);

  return {
    resourceType: 'AccessPolicy',
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
 * @param login - The user login.
 * @param membership - The active project membership.
 * @param accessPolicy - The existing access policy.
 * @returns Updated access policy with all project admin rules applied.
 */
function applyProjectAdminAccessPolicy(
  login: Login,
  membership: ProjectMembership,
  accessPolicy: AccessPolicy | undefined
): AccessPolicy | undefined {
  if (login.superAdmin) {
    // If the user is a super admin, then do not apply any additional access policy rules.
    return accessPolicy;
  }

  if (!membership.admin && !accessPolicy) {
    // Not a project admin and no access policy, so return default access.
    return undefined;
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
      readonlyFields: ['superAdmin', 'features'],
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
      resourceType: 'User',
      criteria: `User?project=${membership.project?.reference}`,
      hiddenFields: ['passwordHash', 'mfaSecret'],
      readonlyFields: ['email', 'emailVerified', 'mfaEnrolled', 'project'],
    });
  }

  return accessPolicy;
}
