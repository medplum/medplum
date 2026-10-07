// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { stringify, tryParseReference } from '@medplum/core';
import type { Reference, Resource } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import { getCacheRedis } from '../../redis';
import { GLOBAL_SHARD_ID, normalizeShardId } from '../sharding';

const RESOURCE_CACHE_EX_SECONDS = 24 * 60 * 60; // 24 hours in seconds

export interface CacheEntry<T extends Resource = Resource> {
  resource: T;
  projectId: string;
  /** The normalized id of the shard holding the resource. */
  shardId: string;
}

/**
 * Tries to read a cache entry from Redis by resource type and ID.
 * @param resourceType - The resource type.
 * @param id - The resource ID.
 * @returns The cache entry if found; otherwise, undefined.
 */
export async function getResourceCacheEntry<T extends Resource>(
  resourceType: string,
  id: string
): Promise<CacheEntry<WithId<T>> | undefined> {
  const cachedValue = await getCacheRedis().get(getResourceCacheKey(resourceType, id));
  return cachedValue ? parseCacheEntry<WithId<T>>(cachedValue) : undefined;
}

/**
 * Performs a bulk read of cache entries from Redis.
 * @param references - Array of FHIR references.
 * @returns Array of cache entries or undefined.
 */
export async function getResourceCacheEntries(references: Reference[]): Promise<(CacheEntry | undefined)[]> {
  const referenceKeys: string[] = [];

  // Build referenceKeys only for valid input references and track
  // their indices in the original array so that the result array
  // is constructed in the correct order.
  const referenceKeyIndices: (number | undefined)[] = new Array(references.length);
  for (let i = 0; i < references.length; i++) {
    const parsed = tryParseReference(references[i]);
    if (parsed) {
      referenceKeys.push(getResourceCacheKey(parsed[0], parsed[1]));
      referenceKeyIndices[i] = referenceKeys.length - 1;
    }
  }

  if (referenceKeys.length === 0) {
    // Return early to avoid calling mget() with no args, which is an error
    return new Array(references.length);
  }

  const cachedValues = await getCacheRedis().mget(referenceKeys);

  const result = new Array<CacheEntry | undefined>(references.length);
  for (let i = 0; i < references.length; i++) {
    const referenceKeyIndex = referenceKeyIndices[i];
    if (referenceKeyIndex === undefined) {
      result[i] = undefined;
    } else {
      const cachedValue = cachedValues[referenceKeyIndex];
      result[i] = cachedValue ? parseCacheEntry(cachedValue) : undefined;
    }
  }
  return result;
}

function parseCacheEntry<T extends Resource>(cachedValue: string): CacheEntry<T> {
  const cacheEntry = JSON.parse(cachedValue) as CacheEntry<T>;
  cacheEntry.shardId ??= GLOBAL_SHARD_ID;
  return cacheEntry;
}

/**
 * Writes a cache entry to Redis.
 * If the `cacheResourcesOnWrite` server config is disabled, does not create a new cache entry unless `force` is set.
 * @param resource - The resource to cache.
 * @param shardId - The shard holding the resource.
 * @param options - Optional write options.
 * @param options.force - Create the entry even if it does not already exist.
 */
export async function setResourceCacheEntry(
  resource: WithId<Resource>,
  shardId: string,
  options?: { force?: boolean }
): Promise<void> {
  const key = getResourceCacheKey(resource.resourceType, resource.id);
  const value = stringify({ resource, projectId: resource.meta?.project, shardId: normalizeShardId(shardId) });
  if (!options?.force && getConfig().cacheResourcesOnWrite === false) {
    await getCacheRedis().set(key, value, 'EX', RESOURCE_CACHE_EX_SECONDS, 'XX');
  } else {
    await getCacheRedis().set(key, value, 'EX', RESOURCE_CACHE_EX_SECONDS);
  }
}

/**
 * Deletes a cache entry from Redis.
 * @param resourceType - The resource type.
 * @param id - The resource ID.
 */
export async function deleteResourceCacheEntry(resourceType: string, id: string): Promise<void> {
  await getCacheRedis().del(getResourceCacheKey(resourceType, id));
}

/**
 * Deletes cache entries from Redis.
 * @param resourceType - The resource type.
 * @param ids - The resource IDs.
 */
export async function deleteResourceCacheEntries(resourceType: string, ids: string[]): Promise<void> {
  const cacheKeys = ids.map((id) => {
    return getResourceCacheKey(resourceType, id);
  });

  await getCacheRedis().del(cacheKeys);
}

/**
 * Returns the redis cache key for the given resource type and resource ID.
 * @param resourceType - The resource type.
 * @param id - The resource ID.
 * @returns The Redis cache key.
 */
export function getResourceCacheKey(resourceType: string, id: string): string {
  return `${resourceType}/${id}`;
}
