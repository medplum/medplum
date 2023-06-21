import { AccessPolicy, AccessPolicyResource, Resource, ResourceType } from '@medplum/fhirtypes';
import { parseCriteriaAsSearchRequest } from './search/search';
import { matchesSearchRequest } from './search/match';

/**
 * Public resource types are in the "public" project.
 * They are available to all users.
 */
export const publicResourceTypes = [
  'CapabilityStatement',
  'CompartmentDefinition',
  'ImplementationGuide',
  'OperationDefinition',
  'SearchParameter',
  'StructureDefinition',
];

/**
 * Protected resource types are in the "medplum" project.
 * Reading and writing is limited to the system account.
 */
export const protectedResourceTypes = ['DomainConfiguration', 'JsonWebKey', 'Login', 'User'];

/**
 * Project admin resource types are special resources that are only
 * accessible to project administrators.
 */
export const projectAdminResourceTypes = ['PasswordChangeRequest', 'Project', 'ProjectMembership'];

/**
 * Determines if the current user can read the specified resource type.
 * @param accessPolicy The access policy.
 * @param resourceType The resource type.
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
 * @param accessPolicy The access policy.
 * @param resourceType The resource type.
 * @returns True if the current user can write the specified resource type.
 */
export function canWriteResourceType(accessPolicy: AccessPolicy, resourceType: ResourceType): boolean {
  if (protectedResourceTypes.includes(resourceType)) {
    return false;
  }
  if (publicResourceTypes.includes(resourceType)) {
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
 * @param accessPolicy The access policy.
 * @param resource The resource.
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
 * @param accessPolicy The access policy.
 * @param resource The resource.
 * @param readonlyMode True if the resource is being read.
 * @returns True if the resource matches the access policy.
 */
export function matchesAccessPolicy(accessPolicy: AccessPolicy, resource: Resource, readonlyMode: boolean): boolean {
  if (accessPolicy.resource) {
    for (const resourcePolicy of accessPolicy.resource) {
      if (matchesAccessPolicyResourcePolicy(resource, resourcePolicy, readonlyMode)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns true if the resource satisfies the specified access policy resource policy.
 * @param resource The resource.
 * @param resourcePolicy One per-resource policy section from the access policy.
 * @param readonlyMode True if the resource is being read.
 * @returns True if the resource matches the access policy.
 */
function matchesAccessPolicyResourcePolicy(
  resource: Resource,
  resourcePolicy: AccessPolicyResource,
  readonlyMode: boolean
): boolean {
  const resourceType = resource.resourceType;
  if (!matchesAccessPolicyResourceType(resourcePolicy.resourceType, resourceType)) {
    return false;
  }
  if (!readonlyMode && resourcePolicy.readonly) {
    return false;
  }
  if (
    resourcePolicy.compartment &&
    !resource.meta?.compartment?.find((c) => c.reference === resourcePolicy.compartment?.reference)
  ) {
    // Deprecated - to be removed
    return false;
  }
  if (
    resourcePolicy.criteria &&
    !matchesSearchRequest(resource, parseCriteriaAsSearchRequest(resourcePolicy.criteria))
  ) {
    return false;
  }
  return true;
}

/**
 * Returns true if the resource type matches the access policy resource type.
 * @param accessPolicyResourceType The resource type from the access policy.
 * @param resourceType The candidate resource resource type.
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
