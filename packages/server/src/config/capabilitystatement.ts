// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isResourceType } from '@medplum/core';
import type {
  CapabilityStatement,
  CapabilityStatementRestInteraction,
  CapabilityStatementRestResourceInteraction,
} from '@medplum/fhirtypes';
import type { MedplumCapabilityStatementConfig } from './types';

/**
 * The resource interactions advertised by default, in the order they appear in the statement.
 */
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

/**
 * The system interactions advertised by default.
 */
export const DEFAULT_SYSTEM_INTERACTIONS: CapabilityStatementRestInteraction['code'][] = ['transaction', 'batch'];

/**
 * The key used in `interactions` to set the default for resource types that are not listed explicitly.
 */
export const DEFAULT_INTERACTIONS_KEY = '*';

/**
 * Top level fields that cannot be set by the overlay.
 *
 * `resourceType` would produce an invalid resource. `rest` is excluded because hand-authoring it reintroduces
 * the drift problem that the generated statement exists to avoid; use the filters instead.
 */
const OVERLAY_IGNORED_FIELDS = ['resourceType', 'rest'];

/**
 * Returns configuration errors for the CapabilityStatement settings.
 * Returns an empty array when the settings are absent or valid.
 * @param config - The CapabilityStatement configuration to validate.
 * @returns A list of human-readable configuration error messages.
 */
export function getCapabilityStatementConfigErrors(config: MedplumCapabilityStatementConfig | undefined): string[] {
  if (!config) {
    return [];
  }

  const errors: string[] = [];

  if (config.includeResourceTypes?.length && config.excludeResourceTypes?.length) {
    errors.push(
      'capabilityStatement.includeResourceTypes and capabilityStatement.excludeResourceTypes cannot both be set'
    );
  }

  for (const key of ['includeResourceTypes', 'excludeResourceTypes'] as const) {
    const unknown = config[key]?.filter((resourceType) => !isResourceType(resourceType));
    if (unknown?.length) {
      errors.push(`capabilityStatement.${key} contains unknown resource type(s): ${unknown.join(', ')}`);
    }
  }

  if (config.interactions) {
    const allowed = new Set<string>(DEFAULT_RESOURCE_INTERACTIONS);
    for (const [resourceType, interactions] of Object.entries(config.interactions)) {
      if (resourceType !== DEFAULT_INTERACTIONS_KEY && !isResourceType(resourceType)) {
        errors.push(`capabilityStatement.interactions contains unknown resource type: ${resourceType}`);
        continue;
      }
      const unknown = interactions.filter((interaction) => !allowed.has(interaction));
      if (unknown.length) {
        errors.push(
          `capabilityStatement.interactions.${resourceType} contains unsupported interaction(s): ${unknown.join(', ')}`
        );
      }
    }
  }

  if (config.systemInteractions) {
    const allowed = new Set<string>(DEFAULT_SYSTEM_INTERACTIONS);
    const unknown = config.systemInteractions.filter((interaction) => !allowed.has(interaction));
    if (unknown.length) {
      errors.push(`capabilityStatement.systemInteractions contains unsupported interaction(s): ${unknown.join(', ')}`);
    }
  }

  for (const field of OVERLAY_IGNORED_FIELDS) {
    if (config.overlay && field in config.overlay) {
      errors.push(
        `capabilityStatement.overlay.${field} is not supported` +
          (field === 'rest' ? '; use includeResourceTypes, excludeResourceTypes, or interactions instead' : '')
      );
    }
  }

  return errors;
}

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

/**
 * Returns the interactions advertised for the given resource type.
 *
 * Resource types with no advertised interactions are still included in the statement, because a resource type
 * can be conformant through operations or search alone.
 *
 * @param resourceType - The resource type.
 * @param config - The CapabilityStatement configuration.
 * @returns The advertised interactions, or undefined if none are advertised.
 */
export function getResourceInteractions(
  resourceType: string,
  config: MedplumCapabilityStatementConfig | undefined
): CapabilityStatementRestResourceInteraction[] | undefined {
  const codes = config?.interactions?.[resourceType] ?? config?.interactions?.[DEFAULT_INTERACTIONS_KEY] ?? undefined;
  if (!codes) {
    return DEFAULT_RESOURCE_INTERACTIONS.map((code) => ({ code }));
  }
  if (codes.length === 0) {
    return undefined;
  }
  // Preserve the canonical ordering rather than the order the admin happened to write.
  return DEFAULT_RESOURCE_INTERACTIONS.filter((code) => codes.includes(code)).map((code) => ({ code }));
}

/**
 * Returns the system level interactions advertised by the server.
 * @param config - The CapabilityStatement configuration.
 * @returns The advertised system interactions, or undefined if none are advertised.
 */
export function getSystemInteractions(
  config: MedplumCapabilityStatementConfig | undefined
): CapabilityStatementRestInteraction[] | undefined {
  const codes = config?.systemInteractions ?? DEFAULT_SYSTEM_INTERACTIONS;
  if (codes.length === 0) {
    return undefined;
  }
  return DEFAULT_SYSTEM_INTERACTIONS.filter((code) => codes.includes(code)).map((code) => ({ code }));
}

/**
 * Applies the configured overlay to the generated CapabilityStatement.
 *
 * Top level fields in the overlay replace the generated values wholesale. Null and undefined values are
 * ignored rather than written through, so the overlay cannot introduce a null into the resource.
 *
 * @param statement - The generated CapabilityStatement.
 * @param overlay - The configured overlay.
 * @returns The CapabilityStatement with the overlay applied.
 */
export function applyCapabilityStatementOverlay(
  statement: CapabilityStatement,
  overlay: MedplumCapabilityStatementConfig['overlay']
): CapabilityStatement {
  if (!overlay) {
    return statement;
  }

  const result: Record<string, unknown> = { ...statement };
  for (const [key, value] of Object.entries(overlay)) {
    if (OVERLAY_IGNORED_FIELDS.includes(key) || value === undefined || value === null) {
      continue;
    }
    result[key] = value;
  }
  return result as unknown as CapabilityStatement;
}
