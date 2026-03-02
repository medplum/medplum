// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, isResourceType } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Project } from '@medplum/fhirtypes';
import { requireSuperAdmin } from '../../admin/super';
import { getAuthenticatedContext } from '../../context';
import { getPubSubRedis } from '../../redis';
import { buildOutputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'get-ws-sub-stats',
  status: 'active',
  kind: 'operation',
  code: 'get-ws-sub-stats',
  experimental: true,
  system: true,
  type: false,
  instance: false,
  parameter: [
    {
      use: 'out',
      name: 'stats',
      type: 'string',
      min: 1,
      max: '1',
    },
  ],
};

export interface WsSubCriteriaStats {
  criteria: string;
  count: number;
}

export interface WsSubResourceTypeStats {
  resourceType: string;
  count: number;
}

export interface WsSubResourceTypeDetailStats {
  resourceType: string;
  count: number;
  criteria: WsSubCriteriaStats[];
}

export interface WsSubProjectStats {
  projectId: string;
  projectName?: string;
  subscriptionCount: number;
  resourceTypes: WsSubResourceTypeStats[];
}

export interface WsSubProjectDetailStats {
  projectId: string;
  resourceTypes: WsSubResourceTypeDetailStats[];
}

export interface WsSubStats {
  projects: WsSubProjectStats[];
}

const ACTIVE_SUB_KEY_PREFIX = 'medplum:subscriptions:r4:project:';
const ACTIVE_PART = ':active:';

export function parseActiveSubKey(key: string): { projectId: string; resourceType: string } | undefined {
  if (!key.startsWith(ACTIVE_SUB_KEY_PREFIX)) {
    return undefined;
  }
  const withoutPrefix = key.slice(ACTIVE_SUB_KEY_PREFIX.length);
  const activeIdx = withoutPrefix.lastIndexOf(ACTIVE_PART);
  if (activeIdx === -1) {
    return undefined;
  }
  const projectId = withoutPrefix.slice(0, activeIdx);
  const resourceType = withoutPrefix.slice(activeIdx + ACTIVE_PART.length);
  // Filter out legacy pre-release keys that used 'v2' instead of a resource type
  if (!isResourceType(resourceType)) {
    return undefined;
  }
  return { projectId, resourceType };
}

export async function getWsSubStatsHandler(_req: FhirRequest): Promise<FhirResponse> {
  requireSuperAdmin();

  const redis = getPubSubRedis();

  // Scan for all active subscription hash keys
  const pattern = 'medplum:subscriptions:r4:project:*:active:*';
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '1000');
    cursor = nextCursor;
    keys.push(...foundKeys);
  } while (cursor !== '0');

  // Build stats: projectId -> resourceType -> count
  const projectMap = new Map<string, Map<string, number>>();

  for (const key of keys) {
    const parsed = parseActiveSubKey(key);
    if (!parsed) {
      continue;
    }
    const { projectId, resourceType } = parsed;

    let resourceTypeMap = projectMap.get(projectId);
    if (!resourceTypeMap) {
      resourceTypeMap = new Map();
      projectMap.set(projectId, resourceTypeMap);
    }

    const count = await redis.hlen(key);
    resourceTypeMap.set(resourceType, (resourceTypeMap.get(resourceType) ?? 0) + count);
  }

  // Convert to output structure, sorted by count descending at each level
  const projects: WsSubProjectStats[] = [];
  for (const [projectId, resourceTypeMap] of projectMap) {
    const resourceTypes: WsSubResourceTypeStats[] = [];
    let totalCount = 0;

    for (const [resourceType, count] of resourceTypeMap) {
      resourceTypes.push({ resourceType, count });
      totalCount += count;
    }

    resourceTypes.sort((a, b) => b.count - a.count);

    projects.push({
      projectId,
      subscriptionCount: totalCount,
      resourceTypes,
    });
  }

  projects.sort((a, b) => b.subscriptionCount - a.subscriptionCount);

  const { repo } = getAuthenticatedContext();
  const projectRefStrs = projects.map((projectInfo) => ({ reference: `Project/${projectInfo.projectId}` }));
  const projectResources = await repo.readReferences<Project>(projectRefStrs);
  for (let i = 0; i < projects.length; i++) {
    const projectOrError = projectResources[i];
    if (projectOrError instanceof Error) {
      continue;
    }
    projects[i].projectName = projectOrError.name;
  }

  const stats: WsSubStats = { projects };

  return [allOk, buildOutputParameters(operation, { stats: JSON.stringify(stats) })];
}
