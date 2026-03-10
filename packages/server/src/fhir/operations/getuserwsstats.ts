// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, getReferenceString } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Reference, Subscription } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import type { ActiveSubMeta } from '../../pubsub';
import { batchIsSubscriptionActive, getUserActiveWebSocketSubscriptions } from '../../pubsub';
import { getCacheRedis } from '../../redis';
import { invariant } from '../../util/invariant';
import type { CacheEntry } from '../repo';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'get-user-ws-stats',
  status: 'active',
  kind: 'operation',
  code: 'get-user-ws-stats',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'user',
      type: 'Reference',
      min: 1,
      max: '1',
    },
    {
      use: 'out',
      name: 'stats',
      type: 'string',
      min: 1,
      max: '1',
    },
  ],
};

export interface WsSubRef {
  ref: string;
  active: boolean;
}

export interface WsUserSubCriteriaGroup {
  criteria: string;
  count: number;
  refs: WsSubRef[];
}

export interface WsUserSubStats {
  user: string;
  totalCount: number;
  criteriaGroups: WsUserSubCriteriaGroup[];
}

export async function getUserWsStatsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const { user } = parseInputParameters<{ user: Reference }>(operation, req);
  if (!user?.reference) {
    return [badRequest('user parameter is required')];
  }
  const userRefStr = getReferenceString(user);
  invariant(userRefStr);

  const cacheRedis = getCacheRedis();

  const subRefs = await getUserActiveWebSocketSubscriptions(userRefStr);

  if (subRefs.length === 0) {
    const stats: WsUserSubStats = { user: userRefStr, totalCount: 0, criteriaGroups: [] };
    return [allOk, buildOutputParameters(operation, { stats: JSON.stringify(stats) })];
  }

  const cacheEntryStrs = await cacheRedis.mget(...subRefs);

  const subRefMetas: ActiveSubMeta[] = [];
  const criteriaMap = new Map<string, string[]>();
  const staleRefs: WsSubRef[] = [];

  for (let i = 0; i < subRefs.length; i++) {
    const subRef = subRefs[i];
    const cacheEntryStr = cacheEntryStrs[i];

    if (!cacheEntryStr) {
      staleRefs.push({ ref: subRef, active: false });
      continue;
    }

    const cacheEntry = JSON.parse(cacheEntryStr) as CacheEntry<Subscription>;
    const criteria = cacheEntry.resource.criteria || '(no criteria)';
    const projectId = cacheEntry.resource.meta?.project ?? '';
    const resourceType = criteria.split('?')[0] ?? '';
    subRefMetas.push({ subRef, projectId, resourceType });

    let refs = criteriaMap.get(criteria);
    if (!refs) {
      refs = [];
      criteriaMap.set(criteria, refs);
    }
    refs.push(subRef);
  }

  const activeMap = await batchIsSubscriptionActive(subRefMetas);

  const criteriaGroups: WsUserSubCriteriaGroup[] = [];
  for (const [criteria, refStrs] of criteriaMap) {
    const refs: WsSubRef[] = refStrs.map((ref) => ({ ref, active: activeMap.get(ref) ?? false }));
    criteriaGroups.push({ criteria, count: refs.length, refs });
  }
  criteriaGroups.sort((a, b) => b.count - a.count);

  if (staleRefs.length > 0) {
    criteriaGroups.push({
      criteria: 'Stale',
      count: staleRefs.length,
      refs: staleRefs,
    });
  }

  const stats: WsUserSubStats = { user: userRefStr, totalCount: subRefs.length, criteriaGroups };
  return [allOk, buildOutputParameters(operation, { stats: JSON.stringify(stats) })];
}
