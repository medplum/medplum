// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { getCacheRedis } from '../../redis';
import type { SystemRepository } from '../repo';

const PROFILE_CACHE_EX_SECONDS = 5 * 60; // 5 minutes in seconds

type CachedResource<T> = {
  resource: T;
  projectId?: string;
};

export async function getCachedProfile(
  projectIds: readonly string[],
  url: string
): Promise<StructureDefinition | undefined> {
  const results = await getCacheRedis().mget(...projectIds.map((projectId) => getProfileCacheKey(projectId, url)));
  const cachedProfile = results.find(Boolean);
  return cachedProfile ? (JSON.parse(cachedProfile) as CachedResource<StructureDefinition>).resource : undefined;
}

export async function cacheProfile(systemRepo: SystemRepository, profile: StructureDefinition): Promise<void> {
  if (!profile.url || !profile.meta?.project) {
    return;
  }

  const resolvedProfile = await systemRepo.readReference(createReference(profile));
  const projectId = resolvedProfile.meta?.project;
  const url = resolvedProfile.url;
  if (!projectId || !url) {
    return;
  }
  await getCacheRedis().set(
    getProfileCacheKey(projectId, url),
    JSON.stringify({ resource: resolvedProfile, projectId }),
    'EX',
    PROFILE_CACHE_EX_SECONDS
  );
}

export async function removeCachedProfile(profile: StructureDefinition): Promise<void> {
  if (!profile.url || !profile.meta?.project) {
    return;
  }

  await getCacheRedis().del(getProfileCacheKey(profile.meta.project, profile.url));
}

export function getProfileCacheKey(projectId: string, url: string): string {
  return `Project/${projectId}/StructureDefinition/${url}`;
}
