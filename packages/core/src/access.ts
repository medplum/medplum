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
export enum AccessPolicyInteraction {
  READ = 'read',
  VREAD = 'vread',
  UPDATE = 'update',
  PATCH = 'patch',
  DELETE = 'delete',
  HISTORY = 'history',
  HISTORY_INSTANCE = 'history-instance',
  HISTORY_TYPE = 'history-type',
  HISTORY_SYSTEM = 'history-system',
  CREATE = 'create',
  SEARCH = 'search',
  SEARCH_TYPE = 'search-type',
  SEARCH_SYSTEM = 'search-system',
  SEARCH_COMPARTMENT = 'search-compartment',
  CAPABILITIES = 'capabilities',
  TRANSACTION = 'transaction',
  BATCH = 'batch',
  OPERATION = 'operation',
}
const resourceReadInteractions = [
  AccessPolicyInteraction.READ,
  AccessPolicyInteraction.VREAD,
  AccessPolicyInteraction.HISTORY,
  AccessPolicyInteraction.HISTORY_INSTANCE,
];

/**
 * Determines if the current user can read the specified resource type.
 * @param accessPolicy - The access policy.
 * @param resourceType - The resource type.
 * @returns True if the current user can read the specified resource type.
 */
export function canReadResourceType(accessPolicy: AccessPolicy, resourceType: ResourceType): boolean {
  if (accessPolicy.resource) {
    for (const resourcePolicy of accessPolicy.resource) {
      if (matchesAccessPolicyResourceType(resourcePolicy.resourceType, resourceType)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Determines if the current user can write the specified resource type.
 * This is a preliminary check before evaluating a write operation in depth.
 * If a user cannot write a resource type at all, then don't bother looking up previous versions.
 * @param accessPolicy - The access policy.
 * @param resourceType - The resource type.
 * @returns True if the current user can write the specified resource type.
 */
export function canWriteResourceType(accessPolicy: AccessPolicy, resourceType: ResourceType): boolean {
  if (protectedResourceTypes.includes(resourceType)) {
    return false;
  }
  if (accessPolicy.resource) {
    for (const resourcePolicy of accessPolicy.resource) {
      if (matchesAccessPolicyResourceType(resourcePolicy.resourceType, resourceType) && !resourcePolicy.readonly) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Determines if the current user can write the specified resource.
 * This is a more in-depth check after building the candidate result of a write operation.
 * @param accessPolicy - The access policy.
 * @param resource - The resource.
 * @returns True if the current user can write the specified resource type.
 */
export function canWriteResource(accessPolicy: AccessPolicy, resource: Resource): boolean {
  const resourceType = resource.resourceType;
  if (!canWriteResourceType(accessPolicy, resourceType)) {
    return false;
  }
  return matchesAccessPolicy(accessPolicy, resource, false);
}

/**
 * Returns true if the resource satisfies the current access policy.
 * @param accessPolicy - The access policy.
 * @param resource - The resource.
 * @param readonlyMode - True if the resource is being read.
 * @returns True if the resource matches the access policy.
 * @deprecated Use satisfiedAccessPolicy() instead.
 */
export function matchesAccessPolicy(accessPolicy: AccessPolicy, resource: Resource, readonlyMode: boolean): boolean {
  if (accessPolicy.resource) {
    for (const resourcePolicy of accessPolicy.resource) {
      if (
        matchesAccessPolicyResourcePolicy(
          resource,
          readonlyMode ? AccessPolicyInteraction.READ : AccessPolicyInteraction.UPDATE,
          resourcePolicy
        )
      ) {
        return true;
      }
    }
  }
  return false;
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
  if (accessPolicy.resource) {
    for (const resourcePolicy of accessPolicy.resource) {
      if (matchesAccessPolicyResourcePolicy(resource, interaction, resourcePolicy)) {
        return resourcePolicy;
      }
    }
  }
  return undefined;
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
  if (!matchesAccessPolicyResourceType(resourcePolicy.resourceType, resourceType)) {
    return false;
  }
  if (resourcePolicy.readonly && !resourceReadInteractions.includes(interaction)) {
    return false;
  }
  if (
    resourcePolicy.compartment &&
    !resource.meta?.compartment?.find((c) => c.reference === resourcePolicy.compartment?.reference)
  ) {
    // Deprecated - to be removed
    return false;
  }
  if (resourcePolicy.criteria && !matchesSearchRequest(resource, parseSearchRequest(resourcePolicy.criteria))) {
    return false;
  }
  return true;
}

/**
 * Returns true if the resource type matches the access policy resource type.
 * @param accessPolicyResourceType - The resource type from the access policy.
 * @param resourceType - The candidate resource resource type.
 * @returns True if the resource type matches the access policy resource type.
 */
function matchesAccessPolicyResourceType(
  accessPolicyResourceType: string | undefined,
  resourceType: ResourceType
): boolean {
  if (accessPolicyResourceType === resourceType) {
    return true;
  }
  if (accessPolicyResourceType === '*' && !projectAdminResourceTypes.includes(resourceType)) {
    // Project admin resource types are not allowed to be wildcarded
    // Project admin resource types must be explicitly included
    return true;
  }
  return false;
}
