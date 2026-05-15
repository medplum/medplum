// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, arrayify, forbidden, getReferenceString } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinitionParameter, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getRateLimitRedis } from '../../redis';
import {
  FHIR_RATE_LIMIT_MEMBERSHIP_PREFIX,
  FHIR_RATE_LIMIT_PROJECT_PREFIX,
  getActiveRateLimitKey,
  getFhirQuotaConfig,
} from '../fhirquota';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

const quotaParts: OperationDefinitionParameter[] = [
  { use: 'out', name: 'limit', type: 'integer', min: 0, max: '1' },
  { use: 'out', name: 'consumedPoints', type: 'integer', min: 0, max: '1' },
  { use: 'out', name: 'remainingPoints', type: 'integer', min: 0, max: '1' },
  { use: 'out', name: 'msBeforeReset', type: 'integer', min: 0, max: '1' },
];

const operation = makeOperationDefinition(
  { scope: 'instance', resource: 'Project' },
  {
    name: 'project-rate-limits',
    code: 'rate-limits',
    parameter: [
      { use: 'in', name: 'membershipId', type: 'string', min: 0, max: '*' },
      {
        use: 'out',
        name: 'project',
        min: 1,
        max: '1',
        part: [{ use: 'out', name: 'id', type: 'string', min: 1, max: '1' }, ...quotaParts],
      },
      {
        use: 'out',
        name: 'membership',
        min: 0,
        max: '*',
        part: [
          { use: 'out', name: 'membershipId', type: 'string', min: 1, max: '1' },
          { use: 'out', name: 'profile', type: 'Reference', min: 0, max: '1' },
          ...quotaParts,
        ],
      },
    ],
  }
);

type RateLimitsInput = {
  membershipId?: string | string[];
};

export async function projectRateLimitsHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (!ctx.repo.isProjectAdmin() && !ctx.repo.isSuperAdmin()) {
    return [forbidden];
  }

  const project = ctx.project;
  const input = parseInputParameters<RateLimitsInput>(operation, req);
  const membershipIds = arrayify(input.membershipId);

  await ctx.fhirRateLimiter?.recordSearch();

  const redis = getRateLimitRedis();

  let memberships: ProjectMembership[];
  if (membershipIds) {
    const reads = await Promise.all(
      membershipIds.map((id) => ctx.repo.readResource<ProjectMembership>('ProjectMembership', id))
    );
    for (const membership of reads) {
      if (membership.project?.reference !== getReferenceString(project)) {
        return [forbidden];
      }
    }
    memberships = reads;
  } else {
    const activeKey = getActiveRateLimitKey(project.id);
    const activeMembershipIds = await redis.zrevrange(activeKey, 0, 999);
    if (activeMembershipIds.length > 0) {
      const references: Reference<ProjectMembership>[] = activeMembershipIds.map((id) => ({
        reference: `ProjectMembership/${id}`,
      }));
      const reads = await ctx.repo.readReferences<ProjectMembership>(references);
      memberships = reads.filter((r): r is ProjectMembership & { id: string } => !(r instanceof Error));
    } else {
      memberships = [];
    }
  }

  const { userLimit, projectLimit } = getFhirQuotaConfig(project);

  const pipeline = redis.pipeline();
  for (const membership of memberships) {
    const key = `${FHIR_RATE_LIMIT_MEMBERSHIP_PREFIX}:${membership.id}`;
    pipeline.get(key);
    pipeline.pttl(key);
  }
  const projectKey = `${FHIR_RATE_LIMIT_PROJECT_PREFIX}:${project.id}`;
  pipeline.get(projectKey);
  pipeline.pttl(projectKey);

  const results = await pipeline.exec();
  if (!results) {
    return [allOk, buildOutputParameters(operation, { project: { id: project.id }, membership: [] })];
  }

  const membershipResults = memberships.map((membership, i) => {
    const consumed = results[i * 2][1] as string | null;
    const pttl = results[i * 2 + 1][1] as number;
    return {
      membershipId: membership.id as string,
      profile: membership.profile,
      ...buildQuotaStatus(consumed, pttl, userLimit),
    };
  });

  const projectConsumed = results[results.length - 2][1] as string | null;
  const projectPttl = results[results.length - 1][1] as number;

  return [
    allOk,
    buildOutputParameters(operation, {
      project: { id: project.id, ...buildQuotaStatus(projectConsumed, projectPttl, projectLimit) },
      membership: membershipResults,
    }),
  ];
}

function buildQuotaStatus(consumed: string | null, pttl: number, limit: number): Record<string, number> | undefined {
  if (consumed === null) {
    return undefined;
  }
  const consumedPoints = parseInt(consumed, 10);
  return {
    limit,
    consumedPoints,
    remainingPoints: Math.max(limit - consumedPoints, 0),
    msBeforeReset: Math.max(pttl, 0),
  };
}
