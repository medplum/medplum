// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { forbidden, getReferenceString, Operator } from '@medplum/core';
import type { ProjectMembership } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { getConfig } from '../config/loader';
import { getAuthenticatedContext } from '../context';
import { sendOutcome } from '../fhir/outcomes';
import { getRateLimitRedis } from '../redis';

interface MembershipRateLimitStatus {
  membershipId: string;
  profileReference: string | undefined;
  fhirQuota: {
    limit: number;
    consumedPoints: number;
    remainingPoints: number;
    msBeforeReset: number;
  } | null;
}

export async function getRateLimitStatusHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAuthenticatedContext();
  const project = ctx.project;

  const membershipIds = req.query.membershipId;
  let idsArray: string[] | undefined;
  if (membershipIds !== undefined) {
    idsArray = Array.isArray(membershipIds)
      ? (membershipIds as string[])
      : [membershipIds as string];
  }

  let memberships: ProjectMembership[];
  if (idsArray) {
    const reads = await Promise.all(
      idsArray.map((id) => ctx.repo.readResource<ProjectMembership>('ProjectMembership', id))
    );
    for (const membership of reads) {
      if (membership.project?.reference !== getReferenceString(project)) {
        sendOutcome(res, forbidden);
        return;
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

  const defaultUserLimit = project.systemSetting?.find((s) => s.name === 'userFhirQuota')?.valueInteger;
  const userLimit = defaultUserLimit ?? getConfig().defaultFhirQuota ?? 50_000;

  const defaultProjectLimit = project.systemSetting?.find((s) => s.name === 'totalFhirQuota')?.valueInteger;
  const projectLimit = defaultProjectLimit ?? userLimit * 10;

  const redis = getRateLimitRedis();
  const membershipLimiter = new RateLimiterRedis({
    keyPrefix: 'medplum:rl:fhir:membership:',
    storeClient: redis,
    points: userLimit,
    duration: 60,
  });

  const projectLimiter = new RateLimiterRedis({
    keyPrefix: 'medplum:rl:fhir:project:',
    storeClient: redis,
    points: projectLimit,
    duration: 60,
  });

  const results: MembershipRateLimitStatus[] = await Promise.all(
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

  res.json({
    project: {
      id: project.id,
      fhirQuota: projectResult
        ? {
            limit: projectLimit,
            consumedPoints: projectResult.consumedPoints,
            remainingPoints: projectResult.remainingPoints,
            msBeforeReset: projectResult.msBeforeNext,
          }
        : null,
    },
    memberships: results,
  });
}
