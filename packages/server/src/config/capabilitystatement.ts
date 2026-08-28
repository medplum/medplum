// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  CapabilityStatementRestInteraction,
  CapabilityStatementRestResourceInteraction,
} from '@medplum/fhirtypes';
import type { MedplumCapabilityStatementConfig } from './types';

/** The resource interactions advertised by default, in the order they appear in the statement. */
export const DEFAULT_RESOURCE_INTERACTIONS: CapabilityStatementRestResourceInteraction['code'][] = [
  'read', // Read the current state of the resource.
  'vread', // Read the state of a specific version of the resource.
  'update', // Update an existing resource by its id.
  'patch', // Update an existing resource by posting a set of changes to it.
  'delete', // Delete a resource.
  'history-instance', // Retrieve the change history for a particular resource.
  'create', // Create a new resource with a server assigned id.
  'search-type', // Search all resources of the specified type based on some filter criteria.
];

/** The system interactions advertised by default. */
export const DEFAULT_SYSTEM_INTERACTIONS: CapabilityStatementRestInteraction['code'][] = ['transaction', 'batch'];

/** The `interactions` key setting the default for resource types not listed explicitly. */
export const DEFAULT_INTERACTIONS_KEY = '*';

/**
 * Returns whether the given resource type should be advertised in the CapabilityStatement.
 * @param resourceType - The resource type to check.
 * @param config - The CapabilityStatement configuration.
 * @returns True if the resource type should be advertised.
 */
export function isResourceTypeAdvertised(
  resourceType: string,
  config: MedplumCapabilityStatementConfig | undefined
): boolean {
  if (config?.includeResourceTypes?.length) {
    return config.includeResourceTypes.includes(resourceType);
  }
  if (config?.excludeResourceTypes?.length) {
    return !config.excludeResourceTypes.includes(resourceType);
  }
  return true;
}

// Restricts the defaults to the configured codes, preserving canonical ordering.
function selectInteractions<T extends string>(defaults: T[], codes: string[] | undefined): { code: T }[] | undefined {
  const selected = codes ?? defaults;
  const result = defaults.filter((code) => selected.includes(code));
  return result.length ? result.map((code) => ({ code })) : undefined;
}

/**
 * Returns the interactions advertised for the given resource type.
 *
 * Resource types with no advertised interactions are still included in the statement, because a resource type
 * can be conformant through operations or search alone.
 *
 * @param resourceType - The resource type.
 * @param config - The CapabilityStatement configuration.
 * @returns The advertised interactions, or undefined when none are advertised.
 */
export function getResourceInteractions(
  resourceType: string,
  config: MedplumCapabilityStatementConfig | undefined
): CapabilityStatementRestResourceInteraction[] | undefined {
  const interactions = config?.interactions;
  return selectInteractions(
    DEFAULT_RESOURCE_INTERACTIONS,
    interactions?.[resourceType] ?? interactions?.[DEFAULT_INTERACTIONS_KEY]
  );
}

/**
 * Returns the system level interactions advertised by the server.
 * @param config - The CapabilityStatement configuration.
 * @returns The advertised system interactions, or undefined when none are advertised.
 */
export function getSystemInteractions(
  config: MedplumCapabilityStatementConfig | undefined
): CapabilityStatementRestInteraction[] | undefined {
  return selectInteractions(DEFAULT_SYSTEM_INTERACTIONS, config?.systemInteractions);
}
