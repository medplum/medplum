// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicy, AccessPolicyResource, Resource, ResourceType } from '@medplum/fhirtypes';
import { matchesSearchRequest } from './search/match';
import { parseSearchRequest } from './search/search';

const universalAccessPolicy: AccessPolicyResource = {
  resourceType: '*',
};

/**
 * Protected resource types are in the "medplum" project.
 * Reading and writing is limited to the system account.
 */
export const protectedResourceTypes = ['DomainConfiguration', 'JsonWebKey', 'Login'];

/**
 * Project admin resource types are special resources that are only
 * accessible to project administrators.
 */
export const projectAdminResourceTypes = [
  'PasswordChangeRequest',
  'UserSecurityRequest',
  'Project',
  'ProjectMembership',
  'User',
];

/**
 * Interactions with a resource that can be controlled via an access policy.
 *
 * Codes taken from http://hl7.org/fhir/codesystem-restful-interaction.html
 */
export const AccessPolicyInteraction = {
  READ: 'read',
  VREAD: 'vread',
  UPDATE: 'update',
  DELETE: 'delete',
  HISTORY: 'history',
  CREATE: 'create',
  SEARCH: 'search',
} as const;
export type AccessPolicyInteraction = (typeof AccessPolicyInteraction)[keyof typeof AccessPolicyInteraction];

export const readInteractions: AccessPolicyInteraction[] = [
  AccessPolicyInteraction.READ,
  AccessPolicyInteraction.VREAD,
  AccessPolicyInteraction.HISTORY,
  AccessPolicyInteraction.SEARCH,
];

/**
 * Determines if the current user can read the specified resource type.
 * @param accessPolicy - The access policy.
 * @param resourceType - The resource type.
 * @returns True if the current user can read the specified resource type.
 * @deprecated Use accessPolicySupportsInteraction() instead.
 */
export function canReadResourceType(accessPolicy: AccessPolicy, resourceType: ResourceType): boolean {
  return accessPolicySupportsInteraction(accessPolicy, AccessPolicyInteraction.SEARCH, resourceType);
}

/**
 * Determines if the current user can write the specified resource type.
 * This is a preliminary check before evaluating a write operation in depth.
 * If a user cannot write a resource type at all, then don't bother looking up previous versions.
 * @param accessPolicy - The access policy.
 * @param resourceType - The resource type.
 * @returns True if the current user can write the specified resource type.
 * @deprecated Use accessPolicySupportsInteraction() instead.
 */
export function canWriteResourceType(accessPolicy: AccessPolicy, resourceType: ResourceType): boolean {
  if (protectedResourceTypes.includes(resourceType)) {
    return false;
  }
  return accessPolicySupportsInteraction(accessPolicy, AccessPolicyInteraction.UPDATE, resourceType);
}

/**
 * Shallow check that an interaction is permitted by the AccessPolicy on a given resource type,
 * at least for some resources.  A more in-depth check for the specific resource(s) being accessed
 * is required in addition to this one.
 * @param accessPolicy - The AccessPolicy to check against.
 * @param interaction - The FHIR interaction being performed.
 * @param resourceType - The type of resource being interacted with.
 * @returns True when the interaction is provisionally permitted by the AccessPolicy.
 */
export function accessPolicySupportsInteraction(
  accessPolicy: AccessPolicy,
  interaction: AccessPolicyInteraction,
  resourceType: ResourceType
): boolean {
  return Boolean(
    accessPolicy.resource?.some((policy) => shallowMatchesResourcePolicy(policy, resourceType, interaction))
  );
}

/**
 * Determines if the current user can write the specified resource.
 * This is a more in-depth check after building the candidate result of a write operation.
 * @param accessPolicy - The access policy.
 * @param resource - The resource.
 * @returns True if the current user can write the specified resource type.
 * @deprecated Use satisfiedAccessPolicy() instead.
 */
export function canWriteResource(accessPolicy: AccessPolicy, resource: Resource): boolean {
  return Boolean(satisfiedAccessPolicy(resource, AccessPolicyInteraction.UPDATE, accessPolicy));
}

/**
 * Checks that there is an access policy permitting the given resource interaction, returning the matching policy object.
 * @param resource - The resource being acted upon.
 * @param interaction - The interaction being performed on the resource.
 * @param accessPolicy - The relevant access policy for the current user.
 * @returns The satisfied access policy, or undefined if the access policy does not permit the given interaction.
 */
export function satisfiedAccessPolicy(
  resource: Resource,
  interaction: AccessPolicyInteraction,
  accessPolicy: AccessPolicy | undefined
): AccessPolicyResource | undefined {
  if (!accessPolicy) {
    return universalAccessPolicy;
  }
  return accessPolicy.resource?.find((policy) => matchesAccessPolicyResourcePolicy(resource, interaction, policy));
}

/**
 * Returns true if the resource satisfies the specified access policy resource policy.
 * @param resource - The resource.
 * @param interaction - The interaction being performed on the resource.
 * @param resourcePolicy - One per-resource policy section from the access policy.
 * @returns True if the resource matches the access policy.
 */
function matchesAccessPolicyResourcePolicy(
  resource: Resource,
  interaction: AccessPolicyInteraction,
  resourcePolicy: AccessPolicyResource
): boolean {
  const resourceType = resource.resourceType;
  if (!shallowMatchesResourcePolicy(resourcePolicy, resourceType, interaction)) {
    return false;
  }
  // Binary has no search parameters, so it cannot be restricted by compartment or criteria
  if (resourceType === 'Binary') {
    return true;
  }
  if (
    resourcePolicy.compartment &&
    !resource.meta?.compartment?.some((c) => c.reference === resourcePolicy.compartment?.reference)
  ) {
    // Deprecated - to be removed in v5
    return false;
  }
  if (resourcePolicy.criteria && !matchesSearchRequest(resource, parseSearchRequest(resourcePolicy.criteria))) {
    return false;
  }
  return true;
}

/**
 * Shallow check if the given interaction on a resource type matches the resource access policy.
 * @param policy - The AccessPolicy resource policy.
 * @param resourceType - The candidate resource type.
 * @param interaction - Interaction type to check against the policy.
 * @returns True when the resource type matches the resource policy.
 */
function shallowMatchesResourcePolicy(
  policy: AccessPolicyResource,
  resourceType: ResourceType,
  interaction: AccessPolicyInteraction
): boolean {
  if (
    policy.resourceType !== resourceType &&
    // Project admin resource types are not allowed to be wildcarded; they must be explicitly included
    (policy.resourceType !== '*' || projectAdminResourceTypes.includes(resourceType))
  ) {
    return false;
  }

  // Only use `readonly` if `interaction` is not specified
  if (!policy.interaction) {
    return !policy.readonly || readInteractions.includes(interaction);
  }
  return policy.interaction.includes(interaction);
}
