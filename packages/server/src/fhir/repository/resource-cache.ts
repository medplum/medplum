// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { stringify, tryParseReference } from '@medplum/core';
import type { Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import type { ChainableCommander } from 'ioredis';
import { getConfig } from '../../config/loader';
import { getCacheRedis } from '../../redis';
import { GLOBAL_SHARD_ID, normalizeShardId } from '../sharding';

const RESOURCE_CACHE_EX_SECONDS = 24 * 60 * 60; // 24 hours in seconds
/** Lifetime of the tombstone that replaces an invalidated entry. */
const RESOURCE_CACHE_TOMBSTONE_EX_SECONDS = 60;
/** Lifetime of the marker that stands in for an entry while the transaction writing it commits. */
const RESOURCE_CACHE_WRITE_MARKER_EX_SECONDS = 5;
/**
 * Stored in place of an entry that must not be served or re-filled: an invalidated entry, or one being written.
 * Empty, so servers from before tombstones existed read it as a miss rather than a malformed entry.
 */
const RESOURCE_CACHE_TOMBSTONE = '';

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
  return parseResourceCacheEntry<WithId<T>>(cachedValue);
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
      result[i] = parseResourceCacheEntry(cachedValues[referenceKeyIndex]);
    }
  }
  return result;
}

/**
 * Parses a raw resource cache value.
 * @param cachedValue - The value read from Redis.
 * @returns The cache entry, or undefined for a missing or invalidated entry.
 */
export function parseResourceCacheEntry<T extends Resource>(cachedValue: string | null): CacheEntry<T> | undefined {
  if (!cachedValue) {
    return undefined;
  }
  const cacheEntry = JSON.parse(cachedValue) as CacheEntry<T>;
  cacheEntry.shardId ??= GLOBAL_SHARD_ID;
  return cacheEntry;
}

/**
 * How a resource cache SET treats an existing entry.
 * - `'write'`: SET after a database write. Before COMMIT the entry is replaced by a 5-second marker, so a
 *   post-commit write that is lost expires to a miss. With `cacheResourcesOnWrite` disabled, only entries that held
 *   a value before the transaction are updated; the others keep the marker.
 * - `'force'`: unconditional SET, for resources that live only in the cache.
 * - `'populate'`: SET NX, to fill a cache miss from a database read. It never replaces an existing entry or an
 *   invalidation tombstone, so a read that queried the database before a writer's COMMIT cannot overwrite the
 *   version the writer cached, or re-cache the version the writer invalidated, after it.
 */
export type ResourceCacheSetMode = 'write' | 'force' | 'populate';

export type ResourceCacheWrite =
  | {
      readonly kind: 'set';
      readonly resourceType: ResourceType;
      readonly key: string;
      readonly value: string;
      readonly mode: ResourceCacheSetMode;
    }
  | { readonly kind: 'invalidate'; readonly resourceType: ResourceType; readonly keys: readonly string[] }
  /** Produced by `prepareResourceCacheCommit`: a 5-second marker that blocks read-fills without caching the written version. */
  | { readonly kind: 'mark'; readonly resourceType: ResourceType; readonly key: string };

/**
 * Builds a cache entry write. The resource is serialized now, so later mutations do not affect the entry.
 * @param resource - The resource to cache.
 * @param shardId - The shard holding the resource.
 * @param mode - How to treat an existing entry.
 * @returns The cache write.
 */
export function buildResourceCacheSet(
  resource: WithId<Resource>,
  shardId: string,
  mode: ResourceCacheSetMode = 'write'
): ResourceCacheWrite {
  return {
    kind: 'set',
    resourceType: resource.resourceType,
    key: getResourceCacheKey(resource.resourceType, resource.id),
    value: stringify({ resource, projectId: resource.meta?.project, shardId: normalizeShardId(shardId) }),
    mode,
  };
}

/**
 * Builds a cache invalidation. Each entry is replaced by a short-lived tombstone rather than deleted, so a
 * database read that started before the invalidating COMMIT cannot re-cache the old version.
 * @param resourceType - The resource type.
 * @param ids - The resource IDs.
 * @returns The cache write.
 */
export function buildResourceCacheInvalidation(resourceType: ResourceType, ids: readonly string[]): ResourceCacheWrite {
  return { kind: 'invalidate', resourceType, keys: ids.map((id) => getResourceCacheKey(resourceType, id)) };
}

/**
 * Runs before COMMIT. Replaces every database-backed entry the writes touch with a marker or tombstone, so if the
 * post-commit writes are lost the entries expire to misses rather than serve the old version.
 * @param writes - The cache writes queued by the transaction, in order.
 * @returns The writes to apply after COMMIT.
 */
export async function prepareResourceCacheCommit(
  writes: readonly ResourceCacheWrite[]
): Promise<readonly ResourceCacheWrite[]> {
  if (writes.length === 0) {
    return writes;
  }
  const updateOnly = getConfig().cacheResourcesOnWrite === false;
  const pipeline = getCacheRedis().pipeline();
  const touched = new Set<string>();
  // Only the first touch of a key decides whether it held an entry: a later write to a key this transaction
  // already invalidated or wrote must not be judged by the marker it left
  const priorValueIndex = new Map<string, number>();
  let commandCount = 0;
  for (const write of writes) {
    if (write.kind === 'invalidate') {
      for (const key of write.keys) {
        pipeline.set(key, RESOURCE_CACHE_TOMBSTONE, 'EX', RESOURCE_CACHE_TOMBSTONE_EX_SECONDS);
        commandCount++;
        touched.add(key);
      }
    } else if (write.kind === 'set' && write.mode === 'write') {
      if (updateOnly && !touched.has(write.key)) {
        priorValueIndex.set(write.key, commandCount);
        pipeline.get(write.key);
        commandCount++;
      }
      pipeline.set(write.key, RESOURCE_CACHE_TOMBSTONE, 'EX', RESOURCE_CACHE_WRITE_MARKER_EX_SECONDS);
      commandCount++;
      touched.add(write.key);
    }
    // 'force' and 'populate' have no database row being committed; 'mark' is only produced here
  }
  if (commandCount === 0) {
    return writes;
  }
  const results = await execResourceCachePipeline(pipeline);
  if (!updateOnly) {
    return writes;
  }
  return writes.map((write) => {
    if (write.kind !== 'set' || write.mode !== 'write') {
      return write;
    }
    const index = priorValueIndex.get(write.key);
    const prior = index === undefined ? null : results[index]?.[1];
    if (typeof prior === 'string' && prior !== RESOURCE_CACHE_TOMBSTONE) {
      return write;
    }
    return { kind: 'mark', resourceType: write.resourceType, key: write.key };
  });
}

/**
 * Applies the writes returned by `prepareResourceCacheCommit`, in order, in one Redis round trip.
 * The pipeline is sent synchronously, before this function first yields.
 * @param writes - The cache writes, in the order they must be applied.
 */
export async function applyResourceCacheWrites(writes: readonly ResourceCacheWrite[]): Promise<void> {
  if (writes.length === 0) {
    return;
  }
  const pipeline = getCacheRedis().pipeline();
  for (const write of writes) {
    if (write.kind === 'invalidate') {
      for (const key of write.keys) {
        pipeline.set(key, RESOURCE_CACHE_TOMBSTONE, 'EX', RESOURCE_CACHE_TOMBSTONE_EX_SECONDS);
      }
    } else if (write.kind === 'mark') {
      pipeline.set(write.key, RESOURCE_CACHE_TOMBSTONE, 'EX', RESOURCE_CACHE_WRITE_MARKER_EX_SECONDS);
    } else if (write.mode === 'populate') {
      pipeline.set(write.key, write.value, 'EX', RESOURCE_CACHE_EX_SECONDS, 'NX');
    } else {
      pipeline.set(write.key, write.value, 'EX', RESOURCE_CACHE_EX_SECONDS);
    }
  }
  await execResourceCachePipeline(pipeline);
}

/**
 * Applies cache writes outside a transaction, with the same semantics as a committed transaction's writes.
 * @param writes - The cache writes, in the order they must be applied.
 */
export async function writeResourceCache(writes: readonly ResourceCacheWrite[]): Promise<void> {
  await applyResourceCacheWrites(await prepareResourceCacheCommit(writes));
}

async function execResourceCachePipeline(pipeline: ChainableCommander): Promise<[Error | null, unknown][]> {
  const results = await pipeline.exec();
  // Per-command failures are reported in the results; a rejected NX is a null reply, not an error
  const failed = results?.find(([err]) => err);
  if (failed?.[0]) {
    throw failed[0];
  }
  return results ?? [];
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
