// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, arrayify, forbidden, getReferenceString, Operator } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { ProjectMembership } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getRateLimitRedis } from '../../redis';
import { FHIR_RATE_LIMIT_MEMBERSHIP_PREFIX, FHIR_RATE_LIMIT_PROJECT_PREFIX, getFhirQuotaConfig } from '../fhirquota';

interface QuotaStatus {
  limit: number;
  consumedPoints: number;
  remainingPoints: number;
  msBeforeReset: number;
}

export async function projectRateLimitsHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (!ctx.repo.isProjectAdmin() && !ctx.repo.isSuperAdmin()) {
    return [forbidden];
  }

  const project = ctx.project;
  const idsArray = arrayify(req.query.membershipId);

  await ctx.fhirRateLimiter?.recordSearch();

  let memberships: ProjectMembership[];
  if (idsArray) {
    const reads = await Promise.all(
      idsArray.map((id) => ctx.repo.readResource<ProjectMembership>('ProjectMembership', id))
    );
    for (const membership of reads) {
      if (membership.project?.reference !== getReferenceString(project)) {
        return [forbidden];
      }
    }
    memberships = reads;
  } else {
    memberships = await ctx.repo.searchResources<ProjectMembership>({
      resourceType: 'ProjectMembership',
      filters: [{ code: 'project', operator: Operator.EQUALS, value: getReferenceString(project) }],
      count: 1000,
    });
  }

  const { userLimit, projectLimit } = getFhirQuotaConfig(project);

  const redis = getRateLimitRedis();
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
    return [allOk, { resourceType: 'Parameters', parameter: [] } as any];
  }

  const membershipResults = memberships.map((membership, i) => {
    const consumed = results[i * 2][1] as string | null;
    const pttl = results[i * 2 + 1][1] as number;
    const quota = parseQuotaResult(consumed, pttl, userLimit);
    return {
      membershipId: membership.id as string,
      profileReference: membership.profile?.reference,
      quota,
    };
  });

  const projectConsumed = results[results.length - 2][1] as string | null;
  const projectPttl = results[results.length - 1][1] as number;
  const projectQuota = parseQuotaResult(projectConsumed, projectPttl, projectLimit);

  return [
    allOk,
    {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'project',
          part: [{ name: 'id', valueString: project.id }, ...quotaParts(projectQuota, projectLimit)],
        },
        ...membershipResults.map((m) => ({
          name: 'membership',
          part: [
            { name: 'membershipId', valueString: m.membershipId },
            ...(m.profileReference ? [{ name: 'profileReference', valueString: m.profileReference }] : []),
            ...quotaParts(m.quota, userLimit),
          ],
        })),
      ],
    } as any,
  ];
}

function parseQuotaResult(consumed: string | null, pttl: number, limit: number): QuotaStatus | undefined {
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

function quotaParts(quota: QuotaStatus | undefined, limit: number): { name: string; valueInteger: number }[] {
  if (!quota) {
    return [];
  }
  return [
    { name: 'limit', valueInteger: limit },
    { name: 'consumedPoints', valueInteger: quota.consumedPoints },
    { name: 'remainingPoints', valueInteger: quota.remainingPoints },
    { name: 'msBeforeReset', valueInteger: quota.msBeforeReset },
  ];
}
