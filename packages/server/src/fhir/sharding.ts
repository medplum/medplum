// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { OperationOutcomeError } from '@medplum/core';
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
 * sharding is fully functional. Resolves to {@link GLOBAL_SHARD_ID} via {@link normalizeShardId}.
 */
export const PLACEHOLDER_SHARD_ID = 'placeholder';

/**
 * Transitory shard ID to use during the future-proofing phase when support for project-based
 * sharding still needs to be determined. Allows the rest of the sharding logic to be implemented
 * and tested before sharding is fully functional. Resolves to {@link GLOBAL_SHARD_ID} via
 * {@link normalizeShardId}.
 */
export const TODO_SHARD_ID = 'todo';

export type ShardRouting = { kind: 'global-only' } | { kind: 'project-shard'; shardId: string };

/**
 * Resource types that always live on the global shard, regardless of the project they belong to.
 *
 * These must be co-located because they have to be searchable before the current project — and
 * therefore the project's shard — is known, i.e. before authentication completes. Every other
 * resource type is project-scoped and lives on the shard of the project that owns it.
 *
 * The criterion for adding a type is "must be readable before the shard ID is knowable", which is
 * not the same as "not project-scoped": some of these tables hold rows carrying `meta.project`.
 */
export const globalShardResourceTypes: ReadonlySet<ResourceType> = new Set([
  'Project', // inherently global since a Project's shard is stored in the Project itself
  'ProjectMembership', // server-scoped User login flow
  'User', // read by email for server-scoped login flow
  'UserSecurityRequest', // read by id for verifyemail and setpassword
  'ClientApplication', // read by id
  'JsonWebKey', // used for signing and verifying JWTs, which is part of the login flow
  'Login', // read by id in auth flow
  'SmartHealthLink', // currently read by id, TODO add projectId to URLs and throw if not available so this line can be removed
  'SmartAppLaunch', // read by id during login
  'DomainConfiguration', // read by domain for external auth flow
]);

/**
 * Collapses the transitory shard IDs onto the global shard so that shard-based routing can be
 * exercised before real shard IDs exist. Also maps an unset shard ID to the global shard.
 * @param shardId - The shard ID to normalize, if any.
 * @returns The shard ID to route by.
 */
export function normalizeShardId(shardId: string | undefined): string {
  if (!shardId || shardId === PLACEHOLDER_SHARD_ID || shardId === TODO_SHARD_ID) {
    return GLOBAL_SHARD_ID;
  }
  return shardId;
}

/**
 * Returns the shard that an operation over the given resource types belongs to.
 *
 * Types in {@link globalShardResourceTypes} resolve to the global shard and everything else to the
 * project's shard ID. Operations that mix the two have no single database that can serve
 * it — unless the repository's shard IS the global shard, in which case both halves land in the same
 * shard and the operation is fine. That is the case until projects are migrated to non-global shards,
 * which is why mixing is not an error on its own. `RepositoryAccessTracker` logs operations spanning
 * logical shards but not physical ones, to inventory what must be split up before a project can move
 * off the global shard. This function itself is pure; it should not log.
 *
 * An empty set is not allowed: "touches no resources" does not identify a destination. A default
 * could silently misroute under-specified requests.
 *
 * @param routing - The context indicating whether the operation is global-only or tied to a project shard.
 * @param resourceTypes - The resource types the operation touches. Must not be empty.
 * @param source - Optional label for the call site, reported in the diagnostics when this throws.
 * @returns The shard ID to route the operation to.
 * @throws {OperationOutcomeError} When the operation spans multiple shards or names no resource types.
 */
export function resolveShardId(
  routing: ShardRouting,
  resourceTypes: ReadonlySet<ResourceType>,
  source?: string
): string {
  let globalTypes: ResourceType[] | undefined;
  let projectTypes: ResourceType[] | undefined;
  for (const resourceType of resourceTypes) {
    if (globalShardResourceTypes.has(resourceType)) {
      globalTypes ??= [];
      globalTypes.push(resourceType);
    } else {
      projectTypes ??= [];
      projectTypes.push(resourceType);
    }
  }

  if (!globalTypes && !projectTypes) {
    throw shardRoutingError(
      'Cannot route an operation that specifies no resource types',
      `source: ${source || 'unknown'}`
    );
  }

  if (!projectTypes) {
    return GLOBAL_SHARD_ID;
  }

  if (routing.kind === 'global-only') {
    // to strictly enforce that global-only routing cannot touch project-scoped resources,
    // throw instead log
    getLogger().warn('Operation cannot be routed to a project shard from global-only routing', {
      project: projectTypes.join(', '),
      source: source || 'unknown',
    });
    // throw shardRoutingError(
    //   'Operation cannot be routed to a project shard from global-only routing',
    //   `project: ${projectTypes.join(', ')}, source: ${source || 'unknown'}`
    // );
  }

  // the fallback to global MUST go away when global-only routing touching
  // project-scoped resources is throws instead of logs
  const routingShardId = routing.kind === 'project-shard' ? routing.shardId : GLOBAL_SHARD_ID;

  const normalizedShardId = normalizeShardId(routingShardId);
  if (!globalTypes) {
    return normalizedShardId;
  }

  // Mixed, but both halves land in the same database, so the operation runs.
  if (normalizedShardId === GLOBAL_SHARD_ID) {
    return GLOBAL_SHARD_ID;
  }

  throw shardRoutingError(
    `Operation cannot span shards`,
    `global: ${globalTypes.join(', ')}, ${routingShardId}: ${projectTypes.join(', ')}, source: ${source || 'unknown'}`
  );
}

/**
 * Returns the error thrown when an operation cannot be routed to a single shard.
 *
 * Modeled as an `exception` outcome and results in a 500 HTTP status code because a violation
 * reaching this point is a server bug: an operation that cannot be atomic across databases
 * should have been rejected, or split up, before it was attempted.
 *
 * Requests a client can make unsatisfiable, e.g. a transaction bundle mixing global and project-scoped
 * resource types like should be rejected as 400 by a preflight in `BatchProcessor` before they
 * reach shard routing.
 * @param message - Description of the operation that could not be routed.
 * @param diagnostics - Additional diagnostic information about the routing error.
 * @returns The error to throw.
 */
export function shardRoutingError(message: string, diagnostics: string | undefined): OperationOutcomeError {
  return new OperationOutcomeError({
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code: 'exception', details: { text: message }, diagnostics }],
  });
}
