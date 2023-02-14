import { ProfileResource, resolveId } from '@medplum/core';
import {
  AccessPolicy,
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
 * @param login The user login.
 * @param membership The active project membership.
 * @param strictMode Optional flag to enable strict mode for in-depth FHIR schema validation.
 * @param extendedMode Optional flag to enable extended mode for custom Medplum properties.
 * @param checkReferencesOnWrite Optional flag to enable reference checking on write.
 * @returns A repository configured for the login details.
 */
export async function getRepoForLogin(
  login: Login,
  membership: ProjectMembership,
  strictMode?: boolean,
  extendedMode?: boolean,
  checkReferencesOnWrite?: boolean
): Promise<Repository> {
  let accessPolicy: AccessPolicy | undefined = undefined;

  if (membership.access || membership.accessPolicy) {
    accessPolicy = await buildAccessPolicy(membership);
  }

  if (login.scope) {
    // If the login specifies SMART scopes,
    // then set the access policy to use those scopes
    accessPolicy = applySmartScopes(accessPolicy, login.scope);
  }

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
 * Builds a parameterized compound access policy.
 * @param access The list of access policies.
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
  for (const entry of access) {
    const replaced = await buildAccessPolicyResources(entry, profile);
    if (replaced.compartment) {
      compartment = replaced.compartment;
    }
    if (replaced.resource) {
      resourcePolicies = resourcePolicies.concat(replaced.resource);
    }
  }

  return { resourceType: 'AccessPolicy', compartment, resource: resourcePolicies };
}

/**
 * Reads an access policy and replaces all variables.
 * @param access The access policy and parameters.
 * @param profile The user profile.
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
