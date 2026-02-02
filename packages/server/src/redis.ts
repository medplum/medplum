// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import Redis from 'ioredis';
import type { MedplumRedisConfig, MedplumServerConfig } from './config/types';
import { GLOBAL_SHARD_ID } from './fhir/sharding';
import { getLogger, globalLogger } from './logger';

/*
 * The `duplicate` method is intentionally omitted to prevent accidental calling of `Redis.quit`
 * which can cause the global instance to fail to shutdown gracefully later on.
 */
export type RedisWithoutDuplicate = Redis & { duplicate: never };

type RedisInstance = { redis: RedisWithoutDuplicate | undefined };
type RedisInstances = {
  cache: RedisInstance;
  rateLimit: RedisInstance;
  pubSub: RedisInstance & { subscribers: Set<Redis> };
  backgroundJobs: RedisInstance;
  default: RedisInstance;
};

const transientErrorTypes = /READONLY|LOADING/;
export function reconnectOnError(err: Error): boolean | 1 | 2 {
  if (transientErrorTypes.test(err.message)) {
    // Reconnect and retry if the connected instance got marked as read-only;
    // this happens during Redis service updates when the cluster fails over
    // between primary and replica instances and the new primary reloads the
    // data set into memory
    return 2;
  }
  getLogger().warn('Unhandled Redis error', err);
  return false; // Do not reconnect on other errors
}

const redisShards: Record<string, RedisInstances> = {};

export function initRedis(config: MedplumServerConfig): void {
  // Global shard is initialized from the top-level server config
  redisShards[GLOBAL_SHARD_ID] = initRedisShard(config);

  // other shards come from the config.shards object
  for (const [shardId, shardConfig] of Object.entries(config.shards ?? {})) {
    // SHARDING - global shard will be removed from the config.shards object
    if (shardId === GLOBAL_SHARD_ID) {
      continue;
    }
    globalLogger.info(`Initializing Redis shard ${shardId}`);
    redisShards[shardId] = initRedisShard(shardConfig);
  }
}

interface RedisShardConfig {
  redis: MedplumRedisConfig;
  cacheRedis?: MedplumRedisConfig;
  rateLimitRedis?: MedplumRedisConfig;
  pubSubRedis?: MedplumRedisConfig;
  backgroundJobsRedis?: MedplumRedisConfig;
}

function initRedisShard(config: RedisShardConfig): RedisInstances {
  const redisInstances: RedisInstances = {
    cache: { redis: undefined },
    rateLimit: { redis: undefined },
    pubSub: { redis: undefined, subscribers: new Set() },
    backgroundJobs: { redis: undefined },
    default: { redis: undefined },
  };

  redisInstances.default.redis = new Redis({
    ...config.redis,
    reconnectOnError,
  }) as RedisWithoutDuplicate;

  if (config.cacheRedis) {
    redisInstances.cache.redis = new Redis({
      ...config.cacheRedis,
      reconnectOnError,
    }) as RedisWithoutDuplicate;
  }
  if (config.rateLimitRedis) {
    redisInstances.rateLimit.redis = new Redis({
      ...config.rateLimitRedis,
      reconnectOnError,
    }) as RedisWithoutDuplicate;
  }
  if (config.pubSubRedis) {
    redisInstances.pubSub.redis = new Redis({
      ...config.pubSubRedis,
      reconnectOnError,
    }) as RedisWithoutDuplicate;
  }
  if (config.backgroundJobsRedis) {
    redisInstances.backgroundJobs.redis = new Redis({
      ...config.backgroundJobsRedis,
      reconnectOnError,
    }) as RedisWithoutDuplicate;
  }

  return redisInstances;
}

function getShardRedisInstances(shardId: string): RedisInstances {
  const redisInstances = redisShards[shardId];
  if (!redisInstances) {
    throw new Error('Redis shard not initialized', { cause: { shardId } });
  }
  return redisInstances;
}

let closing = false;
export async function closeRedis(): Promise<void> {
  for (const redisShard of Object.values(redisShards)) {
    await closeRedisInstances(redisShard);
  }
}

async function closeRedisInstances(redisInstances: RedisInstances): Promise<void> {
  try {
    closing = true;

    // Disconnect pub/sub subscribers
    for (const subscriber of redisInstances.pubSub.subscribers) {
      subscriber.disconnect();
      redisInstances.pubSub.subscribers.delete(subscriber);
    }
    redisInstances.pubSub.subscribers.clear();

    let quitAny = false;
    let key: keyof typeof redisInstances;
    // eslint-disable-next-line guard-for-in
    for (key in redisInstances) {
      const redis = redisInstances[key].redis;
      if (redis) {
        redisInstances[key].redis = undefined;
        await redis.quit();
        quitAny = true;
      }
    }
    if (quitAny) {
      await sleep(100);
    }
  } finally {
    closing = false;
  }
}

function getRedisInstance(redisInstances: RedisInstances, label: keyof RedisInstances): RedisWithoutDuplicate {
  if (closing) {
    throw new Error('Redis is closing, cannot get cache Redis');
  }
  const instance = redisInstances[label].redis ?? redisInstances.default.redis;
  if (!instance) {
    throw new Error(`Redis instance for ${label} not initialized`);
  }
  return instance;
}

/**
 * Gets the `Redis` instance designated for caching operations.
 * Falls back to the default instance if no separate cache Redis is configured.
 *
 * @param shardId - The shard ID to use.
 * @returns The cache `Redis` instance.
 */
export function getCacheRedis(shardId: string): RedisWithoutDuplicate {
  const redisInstances = getShardRedisInstances(shardId);
  return getRedisInstance(redisInstances, 'cache');
}

/**
 * Gets the `Redis` instance designated for rate limiting operations.
 * Falls back to the default instance if no separate rate limit Redis is configured.
 *
 * @param shardId - The shard ID to use.
 * @returns The rate limit `Redis` instance.
 */
export function getRateLimitRedis(shardId: string): RedisWithoutDuplicate {
  const redisInstances = getShardRedisInstances(shardId);
  return getRedisInstance(redisInstances, 'rateLimit');
}

/**
 * Gets the `Redis` instance designated for pub/sub operations (publishing).
 * Falls back to the default instance if no separate pub/sub Redis is configured.
 *
 * @param shardId - The shard ID to use.
 * @returns The pub/sub `Redis` instance.
 */
export function getPubSubRedis(shardId: string): RedisWithoutDuplicate {
  const redisInstances = getShardRedisInstances(shardId);
  return getRedisInstance(redisInstances, 'pubSub');
}

/**
 * Gets a `Redis` instance for use in subscriber mode.
 * Duplicates from the pub/sub Redis instance if configured, otherwise from the default instance.
 *
 * The synchronous `.disconnect()` on this instance should be called instead of `.quit()` when you want to disconnect.
 *
 * @param shardId - The shard ID to use.
 * @returns A `Redis` instance to use as a subscriber client.
 */
export function getPubSubRedisSubscriber(shardId: string): RedisWithoutDuplicate & { quit: never } {
  if (closing) {
    throw new Error('Redis is closing, cannot create subscriber');
  }

  const redisInstances = getShardRedisInstances(shardId);
  const sourceInstance = redisInstances.pubSub.redis ?? redisInstances.default.redis;
  if (!sourceInstance) {
    throw new Error('Redis not initialized');
  }
  const subscriber = (sourceInstance as Redis).duplicate();
  redisInstances.pubSub.subscribers ??= new Set();
  redisInstances.pubSub.subscribers.add(subscriber);

  subscriber.on('end', () => {
    redisInstances.pubSub.subscribers?.delete(subscriber);
  });

  return subscriber as RedisWithoutDuplicate & { quit: never };
}

/**
 * @param shardId - The shard ID to use.
 * @returns The amount of active `Redis` subscriber instances.
 */
export function getPubSubRedisSubscriberCount(shardId: string): number {
  const redisInstances = getShardRedisInstances(shardId);
  return redisInstances.pubSub.subscribers?.size ?? 0;
}

/**
 * Returns all active Redis instances with their purpose labels.
 * Always includes the default instance first, followed by any purpose-specific instances
 * that are configured separately from the default.
 *
 * @param shardId - The shard ID to use.
 * @returns An array of `{ label, instance }` for each active Redis instance.
 */
export function getAllRedisInstances(
  shardId: string
): { label: keyof RedisInstances; instance: RedisWithoutDuplicate }[] {
  const redisInstances = getShardRedisInstances(shardId);
  const results: { label: keyof typeof redisInstances; instance: RedisWithoutDuplicate }[] = [];
  let label: keyof typeof redisInstances;
  // eslint-disable-next-line guard-for-in
  for (label in redisInstances) {
    const instance = redisInstances[label].redis;
    if (instance) {
      results.push({ label, instance });
    }
  }
  return results;
}
