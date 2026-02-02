// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import Redis from 'ioredis';
import type { MedplumRedisConfig, MedplumServerConfig } from './config/types';
import { getLogger } from './logger';
import { GLOBAL_SHARD_ID } from './sharding/sharding-utils';

let globalRedis: Redis | undefined = undefined;

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

const redisShards: Record<string, { redis: Redis; subscribers: Set<Redis> }> = {};

export function initRedis(config: MedplumServerConfig): void {
  globalRedis = initRedisConnection(config.redis);
  redisShards[GLOBAL_SHARD_ID] = { redis: globalRedis, subscribers: new Set() };

  for (const [shardId, shardConfig] of Object.entries(config.shards ?? {})) {
    if (shardId === GLOBAL_SHARD_ID) {
      continue;
    }
    redisShards[shardId] = { redis: initRedisConnection(shardConfig.redis), subscribers: new Set() };
  }
}

function initRedisConnection(config: MedplumRedisConfig): Redis {
  return new Redis({
    ...config,
    reconnectOnError,
  });
}

export async function closeRedis(): Promise<void> {
  const tmpRedisShards: Redis[] = [];
  for (const [shardId, redisShard] of Object.entries(redisShards)) {
    for (const subscriber of redisShard.subscribers) {
      subscriber.disconnect();
    }
    tmpRedisShards.push(redisShard.redis);
    delete redisShards[shardId];
  }

  if (globalRedis) {
    globalRedis = undefined;
    // globalRedis is included in tmpRedisShards, so don't need to quit it again
    await Promise.all(tmpRedisShards.map((r) => r.quit()));
    await sleep(100);
  }
}

/**
 * Gets the global `Redis` instance.
 *
 * The `duplicate` method is intentionally omitted to prevent accidental calling of `Redis.quit`
 * which can cause the global instance to fail to shutdown gracefully later on.
 *
 * Instead {@link getRedisSubscriber} should be called to obtain a `Redis` instance for use as a subscriber-mode client.
 *
 * @param shardId - The shard ID to use.
 * @returns The global `Redis` instance.
 */
export function getRedis(shardId: string): Redis & { duplicate: never } {
  if (shardId.startsWith('TODO')) {
    shardId = GLOBAL_SHARD_ID;
  }
  const redisShard = redisShards[shardId];
  if (!redisShard) {
    throw new Error('Redis shard not initialized', { cause: { shardId } });
  }
  // @ts-expect-error We don't want anyone to call `duplicate on the redis global instance
  // This is because we want to gracefully `quit` and duplicated Redis instances will
  return redisShard.redis;
}

export function getGlobalRedis(): ReturnType<typeof getRedis> {
  return getRedis(GLOBAL_SHARD_ID);
}

/**
 * Gets a `Redis` instance for use in subscriber mode.
 *
 * The synchronous `.disconnect()` on this instance should be called instead of `.quit()` when you want to disconnect.
 *
 * @param shardId - The shard ID to use.
 * @returns A `Redis` instance to use as a subscriber client.
 */
export function getRedisSubscriber(shardId: string): Redis & { quit: never } {
  const redisShard = redisShards[shardId];
  if (!redisShard) {
    throw new Error('Redis shard not initialized', { cause: { shardId } });
  }
  const subscriber = redisShard.redis.duplicate();
  redisShard.subscribers.add(subscriber);

  subscriber.on('end', () => {
    redisShard.subscribers?.delete(subscriber);
  });

  return subscriber as Redis & { quit: never };
}

/**
 * @param shardId - The shard ID to use.
 * @returns The amount of active `Redis` subscriber instances.
 */
export function getRedisSubscriberCount(shardId: string): number {
  const redisShard = redisShards[shardId];
  if (!redisShard) {
    return 0;
  }
  return redisShard.subscribers.size;
}
