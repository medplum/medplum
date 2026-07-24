// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { stringify } from '@medplum/core';
import type { Reference, Resource } from '@medplum/fhirtypes';
import { getCacheRedis } from '../../redis';
import { GLOBAL_SHARD_ID } from '../sharding';

const RESOURCE_CACHE_EX_SECONDS = 24 * 60 * 60; // 24 hours in seconds

export interface CacheEntry<T extends Resource = Resource> {
  resource: T;
  projectId: string;
}

/**
 * Tries to read a cache entry from Redis by resource type and ID.
 * @param resourceType - The resource type.
 * @param id - The resource ID.
 * @param shardId - The database shard containing the resource.
 * @returns The cache entry if found; otherwise, undefined.
 */
export async function getResourceCacheEntry<T extends Resource>(
  resourceType: string,
  id: string,
  shardId: string = GLOBAL_SHARD_ID
): Promise<CacheEntry<WithId<T>> | undefined> {
  const cachedValue = await getCacheRedis().get(getResourceCacheKey(resourceType, id, shardId));
  return cachedValue ? (JSON.parse(cachedValue) as CacheEntry<WithId<T>>) : undefined;
}

/**
 * Performs a bulk read of cache entries from Redis.
 * @param references - Array of FHIR references.
 * @param shardIds - Database shard for each reference.
 * @returns Array of cache entries or undefined.
 */
export async function getResourceCacheEntries(
  references: Reference[],
  shardIds?: readonly string[]
): Promise<(CacheEntry | undefined)[]> {
  if (shardIds && shardIds.length !== references.length) {
    throw new Error('Expected one shard ID per reference');
  }
  const referenceKeys: string[] = [];

  // Build referenceKeys only for valid input references and track
  // their indices in the original array so that the result array
  // is constructed in the correct order.
  const referenceKeyIndices: (number | undefined)[] = new Array(references.length);
  for (let i = 0; i < references.length; i++) {
    const r = references[i];
    if (r.reference) {
      referenceKeys.push(`${shardIds?.[i] ?? GLOBAL_SHARD_ID}/${r.reference}`);
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
      result[i] = cachedValue ? (JSON.parse(cachedValue) as CacheEntry) : undefined;
    }
  }
  return result;
}

/**
 * Writes a cache entry to Redis.
 * @param resource - The resource to cache.
 * @param shardId - The database shard containing the resource.
 */
export async function setResourceCacheEntry(
  resource: WithId<Resource>,
  shardId: string = GLOBAL_SHARD_ID
): Promise<void> {
  const projectId = resource.meta?.project;
  await getCacheRedis().set(
    getResourceCacheKey(resource.resourceType, resource.id, shardId),
    stringify({ resource, projectId }),
    'EX',
    RESOURCE_CACHE_EX_SECONDS
  );
}

/**
 * Deletes a cache entry from Redis.
 * @param resourceType - The resource type.
 * @param id - The resource ID.
 * @param shardId - The database shard containing the resource.
 */
export async function deleteResourceCacheEntry(
  resourceType: string,
  id: string,
  shardId: string = GLOBAL_SHARD_ID
): Promise<void> {
  await getCacheRedis().del(getResourceCacheKey(resourceType, id, shardId));
}

/**
 * Deletes cache entries from Redis.
 * @param resourceType - The resource type.
 * @param ids - The resource IDs.
 * @param shardId - The database shard containing the resources.
 */
export async function deleteResourceCacheEntries(
  resourceType: string,
  ids: string[],
  shardId: string = GLOBAL_SHARD_ID
): Promise<void> {
  const cacheKeys = ids.map((id) => {
    return getResourceCacheKey(resourceType, id, shardId);
  });

  await getCacheRedis().del(cacheKeys);
}

/**
 * Returns the redis cache key for the given resource type and resource ID.
 * @param resourceType - The resource type.
 * @param id - The resource ID.
 * @param shardId - The database shard containing the resource.
 * @returns The Redis cache key.
 */
export function getResourceCacheKey(resourceType: string, id: string, shardId: string = GLOBAL_SHARD_ID): string {
  return `${shardId}/${resourceType}/${id}`;
}
