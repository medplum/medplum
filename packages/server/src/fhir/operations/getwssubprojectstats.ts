// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { getPubSubRedis } from '../../redis';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import type { WsSubCriteriaStats, WsSubProjectDetailStats, WsSubResourceTypeDetailStats } from './getwssubstats';
import { parseActiveSubKey } from './getwssubstats';

const projectStatsOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'get-ws-sub-project-stats',
  status: 'active',
  kind: 'operation',
  code: 'get-ws-sub-project-stats',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'in',
      name: 'projectId',
      type: 'string',
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

export async function getWsSubProjectStatsHandler(req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const { projectId } = parseInputParameters<{ projectId: string }>(projectStatsOperation, req);
  if (!projectId) {
    return [badRequest('projectId parameter is required')];
  }

  const redis = getPubSubRedis();
  const pattern = `medplum:subscriptions:r4:project:${projectId}:active:*`;
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '1000');
    cursor = nextCursor;
    keys.push(...foundKeys);
  } while (cursor !== '0');

  const resourceTypeMap = new Map<string, Map<string, number>>();

  for (const key of keys) {
    const parsed = parseActiveSubKey(key);
    if (!parsed) {
      continue;
    }
    const { resourceType } = parsed;

    let criteriaMap = resourceTypeMap.get(resourceType);
    if (!criteriaMap) {
      criteriaMap = new Map();
      resourceTypeMap.set(resourceType, criteriaMap);
    }

    const entries = await redis.hvals(key);
    for (const criteria of entries) {
      criteriaMap.set(criteria, (criteriaMap.get(criteria) ?? 0) + 1);
    }
  }

  const resourceTypes: WsSubResourceTypeDetailStats[] = [];
  for (const [resourceType, criteriaMap] of resourceTypeMap) {
    const criteria: WsSubCriteriaStats[] = [];
    let count = 0;
    for (const [criteriaStr, criteriaCount] of criteriaMap) {
      criteria.push({ criteria: criteriaStr, count: criteriaCount });
      count += criteriaCount;
    }
    criteria.sort((a, b) => b.count - a.count);
    resourceTypes.push({ resourceType, count, criteria });
  }
  resourceTypes.sort((a, b) => b.count - a.count);

  const stats: WsSubProjectDetailStats = { projectId, resourceTypes };
  return [allOk, buildOutputParameters(projectStatsOperation, { stats: JSON.stringify(stats) })];
}
