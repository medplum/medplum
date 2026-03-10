// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, getReferenceString } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Reference, Subscription } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import type { ActiveSubMeta } from '../../pubsub';
import {
  batchIsSubscriptionActive,
  clearUserActiveWebSocketSubscriptions,
  getUserActiveWebSocketSubscriptions,
  removeActiveSubscriptionsBatch,
} from '../../pubsub';
import { getCacheRedis } from '../../redis';
import { invariant } from '../../util/invariant';
import type { CacheEntry } from '../repo';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'clearuserwssubs',
  status: 'active',
  kind: 'operation',
  code: 'clearuserwssubs',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'userRef',
      type: 'Reference',
      min: 1,
      max: '1',
    },
    {
      use: 'in',
      name: 'removeFromActive',
      type: 'boolean',
      min: 0,
      max: '1',
    },
    {
      use: 'out',
      name: 'deleted',
      type: 'integer',
      min: 1,
      max: '1',
    },
  ],
};

export async function clearAllUserWsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const { userRef, removeFromActive } = parseInputParameters<{
    userRef: Reference;
    removeFromActive?: boolean;
  }>(operation, req);
  if (!userRef?.reference) {
    return [badRequest('userRef parameter is required')];
  }

  const userRefStr = getReferenceString(userRef);
  invariant(userRefStr);

  if (removeFromActive) {
    const cacheRedis = getCacheRedis();
    const subRefs = await getUserActiveWebSocketSubscriptions(userRefStr);

    if (subRefs.length > 0) {
      const cacheEntryStrs = await cacheRedis.mget(...subRefs);

      const metas: ActiveSubMeta[] = [];
      for (let i = 0; i < subRefs.length; i++) {
        const cacheEntryStr = cacheEntryStrs[i];
        if (!cacheEntryStr) {
          continue;
        }
        const cacheEntry = JSON.parse(cacheEntryStr) as CacheEntry<Subscription>;
        const criteria = cacheEntry.resource.criteria ?? '';
        const projectId = cacheEntry.resource.meta?.project ?? '';
        const resourceType = criteria.split('?')[0] ?? '';
        metas.push({ subRef: subRefs[i], projectId, resourceType });
      }

      const activeMap = await batchIsSubscriptionActive(metas);
      const activeMetas = metas.filter(({ subRef }) => activeMap.get(subRef));
      await removeActiveSubscriptionsBatch(activeMetas);
    }
  }

  const deleted = await clearUserActiveWebSocketSubscriptions(userRefStr);
  return [allOk, buildOutputParameters(operation, { deleted })];
}
