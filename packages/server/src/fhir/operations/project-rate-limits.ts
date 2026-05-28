// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, arrayify, badRequest, forbidden, getReferenceString } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinitionParameter, ProjectMembership, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getRateLimitRedis } from '../../redis';
import { getActiveRateLimitKey, getFhirQuotaConfig } from '../fhirquota';
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

  let memberships: WithId<ProjectMembership>[];
  if (membershipIds) {
    const references: Reference<ProjectMembership>[] = membershipIds.map((id) => ({
      reference: `ProjectMembership/${id}`,
    }));
    const reads = await ctx.repo.readReferences<ProjectMembership>(references);
    const failedIds = membershipIds.filter((_, i) => reads[i] instanceof Error);
    if (failedIds.length > 0) {
      return [
        badRequest(
          `Encountered an error when trying to read the following ${failedIds.length} memberships: ${failedIds.join(', ')}`
        ),
      ];
    }
    const successful = reads as WithId<ProjectMembership>[];
    for (const membership of successful) {
      if (membership.project?.reference !== getReferenceString(project)) {
        return [forbidden];
      }
    }
    memberships = successful;
  } else {
    const activeKey = getActiveRateLimitKey(project.id);
    const activeMembershipIds = await redis.zrevrange(activeKey, 0, 999);
    if (activeMembershipIds.length > 0) {
      const references: Reference<ProjectMembership>[] = activeMembershipIds.map((id) => ({
        reference: `ProjectMembership/${id}`,
      }));
      const reads = await ctx.repo.readReferences<ProjectMembership>(references);
      memberships = reads.filter((r): r is WithId<ProjectMembership> => !(r instanceof Error));
    } else {
      memberships = [];
    }
  }

  const limiter = ctx.fhirRateLimiter;
  if (!limiter) {
    return [
      allOk,
      buildOutputParameters(operation, {
        project: { id: project.id },
        membership: memberships.map((m) => ({ membershipId: m.id, profile: m.profile })),
      }),
    ];
  }

  const keys = memberships.map((m) => limiter.getMembershipKey(m.id));
  keys.push(limiter.getProjectKey());

  const pipeline = redis.pipeline();
  pipeline.mget(...keys);
  for (const key of keys) {
    pipeline.pttl(key);
  }

  const results = await pipeline.exec();
  if (!results) {
    return [allOk, buildOutputParameters(operation, { project: { id: project.id }, membership: [] })];
  }

  const consumedValues = results[0][1] as (string | null)[];
  const { userLimit, projectLimit } = getFhirQuotaConfig(ctx.authState);

  const membershipResults = memberships.map((membership, i) => {
    const consumed = consumedValues[i];
    const pttl = results[i + 1][1] as number;
    return {
      membershipId: membership.id,
      profile: membership.profile,
      ...buildQuotaStatus(consumed, pttl, userLimit),
    };
  });

  const projectConsumed = consumedValues[consumedValues.length - 1];
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
