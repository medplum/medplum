// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, ResourceType } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import type { ActiveSubscriptionEntry } from '../../pubsub';
import { getActiveSubsKey } from '../../pubsub';
import { getPubSubRedis } from '../../redis';
import { parseActiveSubKey } from './getwssubstats';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export interface WsSubEntryDetail {
  subscriptionId: string;
  criteria: string;
  expiration: number;
  author: string;
}

export interface WsSubCriteriaDetailStats {
  criteria: string;
  count: number;
  entries: WsSubEntryDetail[];
}

export interface WsSubResourceTypeDetailStats {
  resourceType: string;
  count: number;
  criteria: WsSubCriteriaDetailStats[];
}

export interface WsSubProjectDetailStats {
  projectId: string;
  resourceTypes: WsSubResourceTypeDetailStats[];
}

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
  const pattern = getActiveSubsKey(projectId, '*');
  const resourceTypeMap = new Map<ResourceType, Map<string, WsSubEntryDetail[]>>();

  let cursor = '0';
  do {
    const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '1000');
    cursor = nextCursor;

    if (foundKeys.length > 0) {
      // Parse keys up front so we can correlate pipeline results back to resource types
      const parsedKeys = foundKeys.map((key) => ({ key, parsed: parseActiveSubKey(key) }));

      const pipeline = redis.pipeline();
      for (const { key } of parsedKeys) {
        pipeline.hgetall(key);
      }
      const results = await pipeline.exec();

      if (results) {
        for (let i = 0; i < parsedKeys.length; i++) {
          const { parsed } = parsedKeys[i];
          const [err, hashData] = results[i] as [Error | null, Record<string, string>];
          if (err || !parsed) {
            continue;
          }
          const { resourceType } = parsed;
          let criteriaMap = resourceTypeMap.get(resourceType);
          if (!criteriaMap) {
            criteriaMap = new Map();
            resourceTypeMap.set(resourceType, criteriaMap);
          }
          for (const [ref, rawEntry] of Object.entries(hashData)) {
            const parsed = JSON.parse(rawEntry) as ActiveSubscriptionEntry;
            const entry: WsSubEntryDetail = {
              subscriptionId: ref.replace('Subscription/', ''),
              criteria: parsed.criteria,
              expiration: parsed.expiration,
              author: parsed.author,
            };
            let entries = criteriaMap.get(entry.criteria);
            if (!entries) {
              entries = [];
              criteriaMap.set(entry.criteria, entries);
            }
            entries.push(entry);
          }
        }
      }
    }
  } while (cursor !== '0');

  const resourceTypes: WsSubResourceTypeDetailStats[] = [];
  for (const [resourceType, criteriaMap] of resourceTypeMap) {
    const criteria: WsSubCriteriaDetailStats[] = [];
    let count = 0;
    for (const [criteriaStr, entries] of criteriaMap) {
      criteria.push({ criteria: criteriaStr, count: entries.length, entries });
      count += entries.length;
    }
    criteria.sort((a, b) => b.count - a.count);
    resourceTypes.push({ resourceType, count, criteria });
  }
  resourceTypes.sort((a, b) => b.count - a.count);

  const stats: WsSubProjectDetailStats = { projectId, resourceTypes };
  return [allOk, buildOutputParameters(projectStatsOperation, { stats: JSON.stringify(stats) })];
}
