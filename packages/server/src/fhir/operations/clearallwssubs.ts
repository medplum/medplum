// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { getCacheRedis, getPubSubRedis } from '../../redis';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'clear-ws-subs',
  status: 'active',
  kind: 'operation',
  code: 'clear-ws-subs',
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
  ],
};

export async function clearAllWsSubsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const { projectId } = parseInputParameters<{ projectId?: string }>(operation, req);
  if (projectId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return [badRequest('projectId must be a valid UUID')];
  }
  const { pubSubKeysDeleted, cacheKeysDeleted } = await clearAllWsSubs(projectId);

  return [allOk, buildOutputParameters(operation, { pubSubKeysDeleted, cacheKeysDeleted })];
}

export interface ClearAllWsSubsResult {
  pubSubKeysDeleted: number;
  cacheKeysDeleted: number;
}

/**
 * Clears all WebSocket subscription active hashes from the pubsub Redis instance,
 * and the corresponding subscription cache entries from the cache Redis instance.
 *
 * Scans for `medplum:subscriptions:r4:project:*:active:*` keys (or scoped to a
 * specific project when `projectId` is provided), collects the subscription IDs
 * stored as hash fields, then unlinks both the pubsub hashes and the cache entries
 * using UNLINK (non-blocking) per-scan-batch to avoid tying up Redis.
 *
 * @param projectId - Optional project ID to scope the clear. Clears all projects when omitted.
 * @returns Counts of pubsub hash keys and cache keys unlinked.
 */
export async function clearAllWsSubs(projectId?: string): Promise<ClearAllWsSubsResult> {
  const pubSubRedis = getPubSubRedis();
  const cacheRedis = getCacheRedis();
  const pattern = projectId
    ? `medplum:subscriptions:r4:project:${projectId}:active:*`
    : 'medplum:subscriptions:r4:project:*:active:*';

  let pubSubKeysDeleted = 0;
  let cacheKeysDeleted = 0;
  let cursor = '0';

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

  return { pubSubKeysDeleted, cacheKeysDeleted };
}
