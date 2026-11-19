// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { stringify, tryParseReference } from '@medplum/core';
import type { Reference, Resource, ResourceType } from '@medplum/fhirtypes';
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
export async function getResourceCacheEntries(references: readonly Reference[]): Promise<(CacheEntry | undefined)[]> {
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
 * A resource cache write, built when the write is requested and applied by {@link writeResourceCache}.
 * Without `force`, a `set` does not create a missing entry when the `cacheResourcesOnWrite` server config is disabled.
 */
export type ResourceCacheWrite =
  | {
      readonly kind: 'set';
      readonly resourceType: ResourceType;
      readonly key: string;
      readonly value: string;
      readonly force: boolean;
    }
  | { readonly kind: 'delete'; readonly resourceType: ResourceType; readonly keys: readonly string[] };

/**
 * Builds a cache entry write. The resource is serialized now, so later mutations do not affect the entry.
 * @param resource - The resource to cache.
 * @param shardId - The shard holding the resource.
 * @param options - Optional write options.
 * @param options.force - Create the entry even if it does not already exist.
 * @returns The cache write.
 */
export function buildResourceCacheSet(
  resource: WithId<Resource>,
  shardId: string,
  options?: { force?: boolean }
): ResourceCacheWrite {
  return {
    kind: 'set',
    resourceType: resource.resourceType,
    key: getResourceCacheKey(resource.resourceType, resource.id),
    value: stringify({ resource, projectId: resource.meta?.project, shardId: normalizeShardId(shardId) }),
    force: options?.force ?? false,
  };
}

/**
 * Builds a cache entry deletion.
 * @param resourceType - The resource type.
 * @param ids - The resource IDs.
 * @returns The cache write.
 */
export function buildResourceCacheDelete(resourceType: ResourceType, ids: readonly string[]): ResourceCacheWrite {
  return { kind: 'delete', resourceType, keys: ids.map((id) => getResourceCacheKey(resourceType, id)) };
}

/**
 * Applies cache writes, in order, in one Redis round trip.
 * The pipeline is sent synchronously, before this function first yields.
 * @param writes - The cache writes, in the order they must be applied.
 */
export async function writeResourceCache(writes: readonly ResourceCacheWrite[]): Promise<void> {
  const updateOnly = getConfig().cacheResourcesOnWrite === false;
  const pipeline = getCacheRedis().pipeline();
  for (const write of writes) {
    if (write.kind === 'delete') {
      if (write.keys.length > 0) {
        pipeline.del(...write.keys);
      }
    } else if (updateOnly && !write.force) {
      pipeline.set(write.key, write.value, 'EX', RESOURCE_CACHE_EX_SECONDS, 'XX');
    } else {
      pipeline.set(write.key, write.value, 'EX', RESOURCE_CACHE_EX_SECONDS);
    }
  }
  if (pipeline.length === 0) {
    return;
  }
  const results = await pipeline.exec();
  // Per-command failures are reported in the results rather than rejecting exec; a rejected XX is a null reply
  const failed = results?.find(([err]) => err);
  if (failed?.[0]) {
    throw failed[0];
  }
}

/**
 * Returns the redis cache key for the given resource type and resource ID.
 * @param resourceType - The resource type.
 * @param id - The resource ID.
 * @returns The Redis cache key.
 */
export function getResourceCacheKey(resourceType: string, id: string): string {
  return `${resourceType}/${id.toLowerCase()}`;
}
