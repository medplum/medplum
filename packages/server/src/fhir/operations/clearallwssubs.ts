// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, isUUID } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Subscription } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { getCacheRedis, getPubSubRedis } from '../../redis';
import type { CacheEntry } from '../repo';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'clear-all-ws-subs',
  status: 'active',
  kind: 'operation',
  code: 'clear-all-ws-subs',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'projectId',
      type: 'string',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'pubSubKeysDeleted',
      type: 'integer',
      min: 1,
      max: '1',
    },
    {
      use: 'out',
      name: 'cacheKeysDeleted',
      type: 'integer',
      min: 1,
      max: '1',
    },
    {
      use: 'out',
      name: 'userKeysDeleted',
      type: 'integer',
      min: 1,
      max: '1',
    },
  ],
};

export async function clearAllWsSubsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const { projectId } = parseInputParameters<{ projectId?: string }>(operation, req);
  if (projectId && !isUUID(projectId)) {
    return [badRequest('projectId must be a valid UUID')];
  }
  const { pubSubKeysDeleted, cacheKeysDeleted, userKeysDeleted } = await clearAllWsSubs(projectId);

  return [allOk, buildOutputParameters(operation, { pubSubKeysDeleted, cacheKeysDeleted, userKeysDeleted })];
}

export interface ClearAllWsSubsResult {
  pubSubKeysDeleted: number;
  cacheKeysDeleted: number;
  userKeysDeleted: number;
}

const USER_ACTIVE_SUBS_PATTERN = 'medplum:subscriptions:r4:user:*:active';

/**
 * Clears all WebSocket subscription active hashes from the pubsub Redis instance,
 * the corresponding subscription cache entries from the cache Redis instance,
 * and the per-user active subscription sets from the pubsub Redis instance.
 *
 * Scans for `medplum:subscriptions:r4:project:*:active:*` keys (or scoped to a
 * specific project when `projectId` is provided), collects the subscription IDs
 * stored as hash fields, then unlinks both the pubsub hashes and the cache entries
 * using UNLINK (non-blocking) per-scan-batch to avoid tying up Redis.
 *
 * For full clears (no projectId), all `medplum:subscriptions:r4:user:*:active` sets
 * are also scanned and unlinked. For project-scoped clears, cache entries are read
 * first to resolve author refs, then the affected subscription refs are SREMed from
 * the corresponding user sets.
 *
 * @param projectId - Optional project ID to scope the clear. Clears all projects when omitted.
 * @returns Counts of pubsub hash keys, cache keys, and user keys affected.
 */
export async function clearAllWsSubs(projectId?: string): Promise<ClearAllWsSubsResult> {
  const pubSubRedis = getPubSubRedis();
  const cacheRedis = getCacheRedis();
  const pattern = projectId
    ? `medplum:subscriptions:r4:project:${projectId}:active:*`
    : 'medplum:subscriptions:r4:project:*:active:*';

  let pubSubKeysDeleted = 0;
  let cacheKeysDeleted = 0;
  let userKeysDeleted = 0;
  let cursor = '0';

  // For project-scoped clears, accumulate authorRef → subRefs so we can SREM afterwards
  const authorToSubRefs = new Map<string, string[]>();

  do {
    const [nextCursor, keys] = await pubSubRedis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
    cursor = nextCursor;

    if (keys.length > 0) {
      // Collect subscription IDs (hash field names = cache keys like `Subscription/${id}`)
      const hkeysPipeline = pubSubRedis.pipeline();
      for (const key of keys) {
        hkeysPipeline.hkeys(key);
      }
      const hkeysResults = await hkeysPipeline.exec();

      const subscriptionIds: string[] = [];
      if (hkeysResults) {
        for (const [err, fields] of hkeysResults) {
          if (!err && Array.isArray(fields)) {
            subscriptionIds.push(...(fields as string[]));
          }
        }
      }

      // For project-scoped: read cache entries before unlinking to collect author refs
      if (projectId && subscriptionIds.length > 0) {
        const cacheEntryStrs = await cacheRedis.mget(...subscriptionIds);
        for (let i = 0; i < subscriptionIds.length; i++) {
          const cacheEntryStr = cacheEntryStrs[i];
          if (!cacheEntryStr) {
            continue;
          }
          const cacheEntry = JSON.parse(cacheEntryStr) as CacheEntry<Subscription>;
          const authorRef = cacheEntry.resource.meta?.author?.reference;
          if (!authorRef) {
            continue;
          }
          let refs = authorToSubRefs.get(authorRef);
          if (!refs) {
            refs = [];
            authorToSubRefs.set(authorRef, refs);
          }
          refs.push(subscriptionIds[i]);
        }
      }

      // Unlink the pubsub hash keys (non-blocking)
      const pubSubPipeline = pubSubRedis.pipeline();
      for (const key of keys) {
        pubSubPipeline.unlink(key);
      }
      await pubSubPipeline.exec();
      pubSubKeysDeleted += keys.length;

      // Unlink the corresponding cache entries (non-blocking)
      if (subscriptionIds.length > 0) {
        const cachePipeline = cacheRedis.pipeline();
        for (const id of subscriptionIds) {
          cachePipeline.unlink(id);
        }
        await cachePipeline.exec();
        cacheKeysDeleted += subscriptionIds.length;
      }
    }
  } while (cursor !== '0');

  // Clean up per-user active subscription sets
  if (projectId) {
    // Project-scoped: SREM only the cleared subscription refs from each affected user set
    if (authorToSubRefs.size > 0) {
      const pipeline = pubSubRedis.pipeline();
      for (const [authorRef, refs] of authorToSubRefs) {
        pipeline.srem(`medplum:subscriptions:r4:user:${authorRef}:active`, ...refs);
      }
      await pipeline.exec();
      userKeysDeleted = authorToSubRefs.size;
    }
  } else {
    // Full clear: scan and unlink all user active sets
    let userCursor = '0';
    do {
      const [nextCursor, userKeys] = await pubSubRedis.scan(
        userCursor,
        'MATCH',
        USER_ACTIVE_SUBS_PATTERN,
        'COUNT',
        1000
      );
      userCursor = nextCursor;
      if (userKeys.length > 0) {
        const pipeline = pubSubRedis.pipeline();
        for (const key of userKeys) {
          pipeline.unlink(key);
        }
        await pipeline.exec();
        userKeysDeleted += userKeys.length;
      }
    } while (userCursor !== '0');
  }

  return { pubSubKeysDeleted, cacheKeysDeleted, userKeysDeleted };
}
