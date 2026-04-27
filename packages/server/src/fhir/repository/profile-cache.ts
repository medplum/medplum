// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project, StructureDefinition } from '@medplum/fhirtypes';
import { getCacheRedis } from '../../redis';

const PROFILE_CACHE_EX_SECONDS = 5 * 60; // 5 minutes in seconds

interface ProfileCacheEntry {
  resource: StructureDefinition;
  projectId: string;
}

/**
 * Gets a cached profile from Redis if it exists for the given URL and projects prioritizing based on project order.
 * @param projects - The projects to search for the profile.
 * @param url - The canonical URL of the profile.
 * @returns The cached profile if it exists; otherwise, undefined.
 */
export async function getCachedProfile(
  projects: WithId<Project>[],
  url: string
): Promise<StructureDefinition | undefined> {
  const cacheKeys = projects.map((p) => getProfileCacheKey(p.id, url));
  const results = await getCacheRedis().mget(...cacheKeys);
  const cachedProfile = results.find(Boolean) as string | undefined;
  if (cachedProfile) {
    return (JSON.parse(cachedProfile) as ProfileCacheEntry).resource;
  }
  return undefined;
}

/**
 * Writes a FHIR profile cache entry to Redis.
 * @param profile - The profile structure definition.
 */
export async function cacheProfile(profile: WithId<StructureDefinition>): Promise<void> {
  if (!profile.url || !profile.meta?.project) {
    return;
  }
  const cacheEntry: ProfileCacheEntry = {
    resource: profile,
    projectId: profile.meta.project,
  };
  await getCacheRedis().set(
    getProfileCacheKey(profile.meta.project, profile.url),
    JSON.stringify(cacheEntry),
    'EX',
    PROFILE_CACHE_EX_SECONDS
  );
}

/**
 * Deletes a FHIR profile cache entry from Redis if it exists
 * @param profile - The profile structure definition.
 */
export async function removeCachedProfile(profile: StructureDefinition): Promise<void> {
  if (!profile.url || !profile.meta?.project) {
    return;
  }
  await getCacheRedis().del(getProfileCacheKey(profile.meta.project, profile.url));
}

/**
 * Returns the redis cache key for the given profile resource.
 * @param projectId - The ID of the Project to which the profile belongs.
 * @param url - The canonical URL of the profile.
 * @returns The Redis cache key.
 */
function getProfileCacheKey(projectId: string, url: string): string {
  return `Project/${projectId}/StructureDefinition/${url}`;
}
