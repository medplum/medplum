/*
 * Parse HL7 SMART scope strings.
 * https://build.fhir.org/ig/HL7/smart-app-launch/scopes-and-launch-context.html
 */

import { deepClone } from '@medplum/core';
import { AccessPolicy, AccessPolicyResource } from '@medplum/fhirtypes';

export interface SmartScope {
  readonly permissionType: 'patient' | 'user' | 'system';
  readonly resourceType: string;
  readonly scope: string;
}

/**
 * Parses an OAuth scope string into a list of SMART scopes.
 * Only includes SMART scopes, all other scopes are ignored.
 * @param scope The OAuth scope string.
 * @returns Array of SMART scopes.
 */
export function parseSmartScopes(scope: string | undefined): SmartScope[] {
  const result: SmartScope[] = [];

  if (scope) {
    for (const scopeTerm of scope.split(' ')) {
      const match = scopeTerm.match(/(patient|user|system)\/(\w+|\*)\.(\w+)/);
      if (match) {
        result.push({
          permissionType: match[1] as 'patient' | 'user' | 'system',
          resourceType: match[2],
          scope: match[3],
        });
      }
    }
  }

  return result;
}

/**
 * Applies SMART scopes to an AccessPolicy.
 * If there are no SMART scopes, the AccessPolicy is returned unmodified.
 * If there is no access policy, a new one is created.
 * Otherwise, the AccessPolicy is modified to only include the SMART scopes.
 * @param accessPolicy The original access policy.
 * @param scope The OAuth scope string.
 * @returns Updated access policy with the OAuth scope applied.
 */
export function applySmartScopes(
  accessPolicy: AccessPolicy | undefined,
  scope: string | undefined
): AccessPolicy | undefined {
  const smartScopes = parseSmartScopes(scope);
  if (smartScopes.length === 0) {
    // No SMART scopes, so no changes to the access policy
    return accessPolicy;
  }

  if (accessPolicy) {
    // Build an access policy that is the intersection of the existing access policy and the SMART scopes
    return intersectSmartScopes(accessPolicy, smartScopes);
  }

  // Otherwise, generate an AccessPolicy from scratch
  return generateSmartScopesPolicy(smartScopes);
}

function intersectSmartScopes(accessPolicy: AccessPolicy, smartScope: SmartScope[]): AccessPolicy {
  const result = deepClone(accessPolicy);

  // Build list of AccessPolicy entries
  const accessPolicyEntries = result.resource as AccessPolicyResource[];

  // Sort both by resource type
  accessPolicyEntries.sort((a, b) => (a.resourceType as string).localeCompare(b.resourceType as string));
  smartScope.sort((a, b) => a.resourceType.localeCompare(b.resourceType));

  let i = 0; // accessPolicyEntries index
  let j = 0; // smartScope index
  while (i < accessPolicyEntries.length && j < smartScope.length) {
    const accessPolicyResourceType = accessPolicyEntries[i].resourceType as string;
    const smartScopeResourceType = smartScope[j].resourceType;

    if (accessPolicyResourceType === smartScopeResourceType) {
      // Merge
      i++;
      j++;
    } else if (accessPolicyResourceType < smartScopeResourceType) {
      // Remove
      accessPolicyEntries.splice(i, 1);
    } else {
      // Ignore
      j++;
    }
  }

  // Ignore SMART scopes that don't match the resource type
  // Remove AccessPolicy entries that don't match the SMART scope
  if (i < accessPolicyEntries.length) {
    accessPolicyEntries.splice(i);
  }

  return result;
}

function generateSmartScopesPolicy(smartScopes: SmartScope[]): AccessPolicy {
  const result: AccessPolicy = {
    resourceType: 'AccessPolicy',
    resource: [],
  };

  for (const smartScope of smartScopes) {
    (result.resource as AccessPolicyResource[]).push({
      resourceType: smartScope.resourceType,
    });
  }

  return result;
}
