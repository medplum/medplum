// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { EMPTY, sleep } from '@medplum/core';
import Redis from 'ioredis';
import type { MedplumServerConfig } from './config/types';
import { getLogger } from './logger';

let defaultRedis: Redis | undefined = undefined;
let cacheRedisInstance: Redis | undefined = undefined;
let rateLimitRedisInstance: Redis | undefined = undefined;
let pubsubRedisInstance: Redis | undefined = undefined;
let pubsubSubscribers: Set<Redis> | undefined = undefined;

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
  defaultRedis = new Redis({
    ...config.redis,
    reconnectOnError,
  });

  if (config.cacheRedis) {
    cacheRedisInstance = new Redis({
      ...config.cacheRedis,
      reconnectOnError,
    });
  }
  if (config.rateLimitRedis) {
    rateLimitRedisInstance = new Redis({
      ...config.rateLimitRedis,
      reconnectOnError,
    });
  }
  if (config.pubsubRedis) {
    pubsubRedisInstance = new Redis({
      ...config.pubsubRedis,
      reconnectOnError,
    });
  }
}

let closing = false;
export async function closeRedis(): Promise<void> {
  try {
    closing = true;
    // Disconnect pub/sub subscribers
    const tmpPubsubSubscribers = pubsubSubscribers;
    pubsubSubscribers = undefined;
    for (const subscriber of tmpPubsubSubscribers ?? EMPTY) {
      subscriber.disconnect();
    }

    // Close purpose-specific instances first
    const purposeInstances = [cacheRedisInstance, rateLimitRedisInstance, pubsubRedisInstance];
    cacheRedisInstance = undefined;
    rateLimitRedisInstance = undefined;
    pubsubRedisInstance = undefined;
    for (const instance of purposeInstances) {
      if (instance) {
        await instance.quit();
      }
    }

    if (defaultRedis) {
      const tmpRedis = defaultRedis;
      defaultRedis = undefined;
      await tmpRedis.quit();
      await sleep(100);
    }
  } finally {
    closing = false;
  }
}

/**
 * Gets the default `Redis` instance.
 *
 * The `duplicate` method is intentionally omitted to prevent accidental calling of `Redis.quit`
 * which can cause the global instance to fail to shutdown gracefully later on.
 *
 * Instead {@link getPubSubRedisSubscriber} should be called to obtain a `Redis` instance for use as a subscriber-mode client.
 *
 * @returns The default `Redis` instance.
 */
export function getRedis(): Redis & { duplicate: never } {
  if (!defaultRedis) {
    throw new Error('Redis not initialized');
  }
  // @ts-expect-error We don't want anyone to call `duplicate on the redis global instance
  // This is because we want to gracefully `quit` and duplicated Redis instances will
  return defaultRedis;
}

/**
 * Gets the `Redis` instance designated for caching operations.
 * Falls back to the default instance if no separate cache Redis is configured.
 *
 * @returns The cache `Redis` instance.
 */
export function getCacheRedis(): Redis & { duplicate: never } {
  const instance = cacheRedisInstance ?? defaultRedis;
  if (!instance) {
    throw new Error('Redis not initialized');
  }
  // @ts-expect-error See getRedis
  return instance;
}

/**
 * Gets the `Redis` instance designated for rate limiting operations.
 * Falls back to the default instance if no separate rate limit Redis is configured.
 *
 * @returns The rate limit `Redis` instance.
 */
export function getRateLimitRedis(): Redis & { duplicate: never } {
  const instance = rateLimitRedisInstance ?? defaultRedis;
  if (!instance) {
    throw new Error('Redis not initialized');
  }
  // @ts-expect-error See getRedis
  return instance;
}

/**
 * Gets the `Redis` instance designated for pub/sub operations (publishing).
 * Falls back to the default instance if no separate pub/sub Redis is configured.
 *
 * @returns The pub/sub `Redis` instance.
 */
export function getPubSubRedis(): Redis & { duplicate: never } {
  const instance = pubsubRedisInstance ?? defaultRedis;
  if (!instance) {
    throw new Error('Redis not initialized');
  }
  // @ts-expect-error See getRedis
  return instance;
}

/**
 * Gets a `Redis` instance for use in subscriber mode.
 * Duplicates from the pub/sub Redis instance if configured, otherwise from the default instance.
 *
 * The synchronous `.disconnect()` on this instance should be called instead of `.quit()` when you want to disconnect.
 *
 * @returns A `Redis` instance to use as a subscriber client.
 */
export function getPubSubRedisSubscriber(): Redis & { quit: never } {
  if (closing) {
    throw new Error('Redis is closing, cannot create subscriber');
  }

  const sourceInstance = pubsubRedisInstance ?? defaultRedis;
  if (!sourceInstance) {
    throw new Error('Redis not initialized');
  }
  const subscriber = sourceInstance.duplicate();
  pubsubSubscribers ??= new Set();
  pubsubSubscribers.add(subscriber);

  subscriber.on('end', () => {
    pubsubSubscribers?.delete(subscriber);
  });

  return subscriber as Redis & { quit: never };
}

/**
 * @returns The amount of active `Redis` subscriber instances.
 */
export function getPubSubRedisSubscriberCount(): number {
  return pubsubSubscribers?.size ?? 0;
}
