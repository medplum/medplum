// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { ResourceType } from '@medplum/fhirtypes';

/**
 * The shard ID for the global database.
 * Also used when sharding is not enabled.
 */
export const GLOBAL_SHARD_ID = 'global';

/**
 * Transitory shard ID to use during the future-proofing phase when it is clear
 * how an actual shard ID should be determined but that logic has not yet been implemented.
 * Allows the rest of the sharding logic to be implemented and tested before
 * sharding is fully functional.
 */
export const PLACEHOLDER_SHARD_ID = 'placeholder';

/**
 * Transitory shard ID to use during the future-proofing phase when support for project-based
 * sharding still needs to be determined. Allows the rest of the sharding logic to be implemented
 * and tested before sharding is fully functional.
 */
export const TODO_SHARD_ID = 'todo';

/**
 * Resolves transitional shard markers to the database they represent today.
 * @param shardId - The configured shard ID.
 * @returns A database shard ID.
 */
export function normalizeShardId(shardId: string | undefined): string {
  if (!shardId || shardId === PLACEHOLDER_SHARD_ID || shardId === TODO_SHARD_ID) {
    return GLOBAL_SHARD_ID;
  }
  return shardId;
}

/**
 * Resource types that always live on the global shard.
 *
 * All other resource types live on the shard associated with the current project.
 * The global shard is also a valid project shard, so global and project-scoped
 * resource types can resolve to the same physical database.
 */
export const globalResourceTypes: ReadonlySet<ResourceType> = new Set<ResourceType>([
  'Project',
  'ProjectMembership',
  'User',
]);

/**
 * Returns whether the resource type always lives on the global shard.
 * @param resourceType - The resource type.
 * @returns True if the resource type is global.
 */
export function isGlobalResourceType(resourceType: ResourceType): boolean {
  return globalResourceTypes.has(resourceType);
}

/**
 * Resolves the database shard for a resource type.
 * @param resourceType - The resource type.
 * @param projectShardId - The current project's shard.
 * @returns The shard containing the resource type.
 */
export function getResourceTypeShardId(resourceType: ResourceType, projectShardId: string): string {
  return isGlobalResourceType(resourceType) ? GLOBAL_SHARD_ID : normalizeShardId(projectShardId);
}

/**
 * Resolves all database shards involved in an operation.
 * @param resourceTypes - The resource types involved in the operation.
 * @param projectShardId - The current project's shard.
 * @returns The distinct resolved shard IDs.
 */
export function getResourceTypeShardIds(
  resourceTypes: Iterable<ResourceType>,
  projectShardId: string
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const resourceType of resourceTypes) {
    result.add(getResourceTypeShardId(resourceType, projectShardId));
  }
  return result;
}
