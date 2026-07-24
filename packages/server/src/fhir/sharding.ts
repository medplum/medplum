// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { OperationOutcomeError, serverError } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { getLogger } from '../logger';

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
 * Resource types that always live on the global shard. They must be co-located so they are
 * searchable/discoverable without fanning out to all shards before the current project is known,
 * i.e. prior to user authentication.
 */
export const globalShardResourceTypes: ReadonlySet<ResourceType> = new Set(['Project', 'ProjectMembership', 'User']);

/**
 * Thrown when a single statement or transaction would span multiple database shards.
 * Indicates a server-code bug rather than a user error, so it carries a server-error (500) outcome.
 * Extending {@link OperationOutcomeError} lets it pass through `normalizeDatabaseError` unchanged
 * when thrown inside a transaction, preserving both the 500 outcome and the error type.
 */
export class ShardRoutingError extends OperationOutcomeError {
  constructor(message: string) {
    super(serverError(new Error(message)));
    this.name = 'ShardRoutingError';
  }
}

/**
 * Maps transitory shard IDs ({@link PLACEHOLDER_SHARD_ID}, {@link TODO_SHARD_ID}) and undefined to
 * {@link GLOBAL_SHARD_ID}. Transitional: goes away once real shard assignment exists everywhere.
 * @param shardId - The shard ID to normalize.
 * @returns The normalized shard ID.
 */
export function normalizeShardId(shardId: string | undefined): string {
  if (shardId === undefined || shardId === PLACEHOLDER_SHARD_ID || shardId === TODO_SHARD_ID) {
    return GLOBAL_SHARD_ID;
  }
  return shardId;
}

/**
 * Resolves the shard a database operation must be routed to based on the resource types involved:
 * only global-shard types map to {@link GLOBAL_SHARD_ID}; only project-scoped types map to the context
 * shard; an empty set (e.g. configuration statements) maps to the context shard. Mixing global-shard
 * and project-scoped types is legal only while the context shard resolves to the global shard (same
 * physical database, logged for burn-down visibility) and otherwise throws {@link ShardRoutingError}.
 * @param contextShardId - The shard ID of the current project context (normalized internally).
 * @param resourceTypes - The resource types involved in the operation.
 * @param source - Short label identifying the call site, for logs and error messages.
 * @returns The shard ID the operation must be routed to.
 */
export function resolveShardId(
  contextShardId: string,
  resourceTypes: ReadonlySet<ResourceType>,
  source?: string
): string {
  let globalTypes: ResourceType[] | undefined;
  let projectTypes: ResourceType[] | undefined;
  for (const resourceType of resourceTypes) {
    if (globalShardResourceTypes.has(resourceType)) {
      (globalTypes ??= []).push(resourceType);
    } else {
      (projectTypes ??= []).push(resourceType);
    }
  }

  const shardId = normalizeShardId(contextShardId);
  if (!globalTypes) {
    return shardId;
  }
  if (!projectTypes) {
    return GLOBAL_SHARD_ID;
  }

  if (shardId === GLOBAL_SHARD_ID) {
    getLogger().info('[RepoSplit] Mixed resource access', {
      globalResourceTypes: globalTypes,
      projectResourceTypes: projectTypes,
      source,
    });
    return GLOBAL_SHARD_ID;
  }

  throw new ShardRoutingError(
    `Cross-shard access: statement mixes global-shard resource types [${globalTypes.join(', ')}] with shard "${shardId}" resource types [${projectTypes.join(', ')}]${source ? ` (source=${source})` : ''}`
  );
}
