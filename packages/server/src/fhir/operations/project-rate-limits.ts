// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, arrayify, forbidden, getReferenceString, Operator } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { ProjectMembership } from '@medplum/fhirtypes';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { getAuthenticatedContext } from '../../context';
import { getRateLimitRedis } from '../../redis';
import {
  FHIR_RATE_LIMIT_DURATION,
  FHIR_RATE_LIMIT_MEMBERSHIP_PREFIX,
  FHIR_RATE_LIMIT_PROJECT_PREFIX,
  getFhirQuotaConfig,
} from '../fhirquota';

export async function projectRateLimitsHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (!ctx.repo.isProjectAdmin() && !ctx.repo.isSuperAdmin()) {
    return [forbidden];
  }

  const project = ctx.project;
  const idsArray = arrayify(req.query.membershipId);

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
  const membershipLimiter = new RateLimiterRedis({
    keyPrefix: FHIR_RATE_LIMIT_MEMBERSHIP_PREFIX,
    storeClient: redis,
    points: userLimit,
    duration: FHIR_RATE_LIMIT_DURATION,
  });

  const projectLimiter = new RateLimiterRedis({
    keyPrefix: FHIR_RATE_LIMIT_PROJECT_PREFIX,
    storeClient: redis,
    points: projectLimit,
    duration: FHIR_RATE_LIMIT_DURATION,
  });

  const membershipResults = await Promise.all(
    memberships.map(async (membership) => {
      const result = await membershipLimiter.get(membership.id as string);
      return {
        membershipId: membership.id as string,
        profileReference: membership.profile?.reference,
        fhirQuota: result
          ? {
              limit: userLimit,
              consumedPoints: result.consumedPoints,
              remainingPoints: result.remainingPoints,
              msBeforeReset: result.msBeforeNext,
            }
          : null,
      };
    })
  );

  const projectResult = await projectLimiter.get(project.id);

  return [
    allOk,
    {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'project',
          part: [
            { name: 'id', valueString: project.id },
            ...(projectResult
              ? [
                  { name: 'limit', valueInteger: projectLimit },
                  { name: 'consumedPoints', valueInteger: projectResult.consumedPoints },
                  { name: 'remainingPoints', valueInteger: projectResult.remainingPoints },
                  { name: 'msBeforeReset', valueInteger: projectResult.msBeforeNext },
                ]
              : []),
          ],
        },
        ...membershipResults.map((m) => ({
          name: 'membership',
          part: [
            { name: 'membershipId', valueString: m.membershipId },
            ...(m.profileReference ? [{ name: 'profileReference', valueString: m.profileReference }] : []),
            ...(m.fhirQuota
              ? [
                  { name: 'limit', valueInteger: m.fhirQuota.limit },
                  { name: 'consumedPoints', valueInteger: m.fhirQuota.consumedPoints },
                  { name: 'remainingPoints', valueInteger: m.fhirQuota.remainingPoints },
                  { name: 'msBeforeReset', valueInteger: m.fhirQuota.msBeforeReset },
                ]
              : []),
          ],
        })),
      ],
    } as any,
  ];
}
