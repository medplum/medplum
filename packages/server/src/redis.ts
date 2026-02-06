// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import Redis from 'ioredis';
import type { MedplumServerConfig } from './config/types';
import { getLogger } from './logger';

/*
 * The `duplicate` method is intentionally omitted to prevent accidental calling of `Redis.quit`
 * which can cause the global instance to fail to shutdown gracefully later on.
 */
export type RedisWithoutDuplicate = Redis & { duplicate: never };

type RedisInstance = { redis: RedisWithoutDuplicate | undefined };

const redisInstances: {
  cache: RedisInstance;
  rateLimit: RedisInstance;
  pubsub: RedisInstance & { subscribers: Set<Redis> };
  bullmq: RedisInstance;
  default: RedisInstance;
} = {
  cache: { redis: undefined },
  rateLimit: { redis: undefined },
  pubsub: { redis: undefined, subscribers: new Set() },
  bullmq: { redis: undefined },
  default: { redis: undefined },
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

export function initRedis(config: MedplumServerConfig): void {
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
  if (config.pubsubRedis) {
    redisInstances.pubsub.redis = new Redis({
      ...config.pubsubRedis,
      reconnectOnError,
    }) as RedisWithoutDuplicate;
  }
  if (config.bullmqRedis) {
    redisInstances.bullmq.redis = new Redis({
      ...config.bullmqRedis,
      reconnectOnError,
    }) as RedisWithoutDuplicate;
  }
}

let closing = false;
export async function closeRedis(): Promise<void> {
  try {
    closing = true;

    // Disconnect pub/sub subscribers
    for (const subscriber of redisInstances.pubsub.subscribers) {
      subscriber.disconnect();
      redisInstances.pubsub.subscribers.delete(subscriber);
    }
    redisInstances.pubsub.subscribers.clear();

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

function getRedisInstance(label: keyof typeof redisInstances): RedisWithoutDuplicate {
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
 * @returns The cache `Redis` instance.
 */
export function getCacheRedis(): RedisWithoutDuplicate {
  return getRedisInstance('cache');
}

/**
 * Gets the `Redis` instance designated for rate limiting operations.
 * Falls back to the default instance if no separate rate limit Redis is configured.
 *
 * @returns The rate limit `Redis` instance.
 */
export function getRateLimitRedis(): RedisWithoutDuplicate {
  return getRedisInstance('rateLimit');
}

/**
 * Gets the `Redis` instance designated for pub/sub operations (publishing).
 * Falls back to the default instance if no separate pub/sub Redis is configured.
 *
 * @returns The pub/sub `Redis` instance.
 */
export function getPubSubRedis(): RedisWithoutDuplicate {
  return getRedisInstance('pubsub');
}

/**
 * Gets a `Redis` instance for use in subscriber mode.
 * Duplicates from the pub/sub Redis instance if configured, otherwise from the default instance.
 *
 * The synchronous `.disconnect()` on this instance should be called instead of `.quit()` when you want to disconnect.
 *
 * @returns A `Redis` instance to use as a subscriber client.
 */
export function getPubSubRedisSubscriber(): RedisWithoutDuplicate & { quit: never } {
  if (closing) {
    throw new Error('Redis is closing, cannot create subscriber');
  }

  const sourceInstance = redisInstances.pubsub.redis ?? redisInstances.default.redis;
  if (!sourceInstance) {
    throw new Error('Redis not initialized');
  }
  const subscriber = (sourceInstance as Redis).duplicate();
  redisInstances.pubsub.subscribers ??= new Set();
  redisInstances.pubsub.subscribers.add(subscriber);

  subscriber.on('end', () => {
    redisInstances.pubsub.subscribers?.delete(subscriber);
  });

  return subscriber as RedisWithoutDuplicate & { quit: never };
}

/**
 * @returns The amount of active `Redis` subscriber instances.
 */
export function getPubSubRedisSubscriberCount(): number {
  return redisInstances.pubsub.subscribers?.size ?? 0;
}

/**
 * Returns all active Redis instances with their purpose labels.
 * Always includes the default instance first, followed by any purpose-specific instances
 * that are configured separately from the default.
 *
 * @returns An array of `{ label, instance }` for each active Redis instance.
 */
export function getAllRedisInstances(): { label: keyof typeof redisInstances; instance: RedisWithoutDuplicate }[] {
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
