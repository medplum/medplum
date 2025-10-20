// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { sleep } from '@medplum/core';
import Redis from 'ioredis';
import type { MedplumRedisConfig, MedplumServerConfig } from './config/types';
import { getLogger } from './logger';

let globalRedis: Redis | undefined = undefined;
let redisSubscribers: Set<Redis> | undefined = undefined;

const redisShards: Record<string, Redis> = {};

export function initRedis(config: MedplumServerConfig): void {
  globalRedis = new Redis({
    ...config.redis,
    reconnectOnError: (err) => {
      if (err.message.includes('READONLY')) {
        // Reconnect and retry if the connected instance got marked as read-only;
        // this happens during Redis service updates when the cluster fails over
        // between primary and replica instances
        return 2;
      }
      getLogger().warn('Unhandled Redis error', err);
      return false; // Do not reconnect on other errors
    },
  });
  redisShards['global'] = globalRedis;

  for (const [shardId, shardConfig] of Object.entries(config.shards ?? {})) {
    if (shardId === 'global') {
      continue;
    }
    redisShards[shardId] = initRedisConnection(shardConfig.redis);
  }
}

function initRedisConnection(config: MedplumRedisConfig): Redis {
  return new Redis({
    ...config,
    reconnectOnError: (err) => {
      if (err.message.includes('READONLY')) {
        // Reconnect and retry if the connected instance got marked as read-only;
        // this happens during Redis service updates when the cluster fails over
        // between primary and replica instances
        return 2;
      }
      getLogger().warn('Unhandled Redis error', err);
      return false; // Do not reconnect on other errors
    },
  });
}

export async function closeRedis(): Promise<void> {
  const tmpRedisShards: Redis[] = [];
  for (const [shardId, redis] of Object.entries(redisShards)) {
    tmpRedisShards.push(redis);
    delete redisShards[shardId];
  }

  if (globalRedis) {
    const tmpSubscribers = redisSubscribers;
    globalRedis = undefined;
    redisSubscribers = undefined;
    if (tmpSubscribers) {
      for (const subscriber of tmpSubscribers) {
        subscriber.disconnect();
      }
    }
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
export function getRedis(shardId: string = 'TODO-getRedis'): Redis & { duplicate: never } {
  if (shardId.startsWith('TODO')) {
    shardId = 'global';
  }
  const redisShard = redisShards[shardId];
  if (!redisShard) {
    throw new Error('Redis not initialized');
  }
  // @ts-expect-error We don't want anyone to call `duplicate on the redis global instance
  // This is because we want to gracefully `quit` and duplicated Redis instances will
  return redisShard;
}

/**
 * Gets a `Redis` instance for use in subscriber mode.
 *
 * The synchronous `.disconnect()` on this instance should be called instead of `.quit()` when you want to disconnect.
 *
 * @returns A `Redis` instance to use as a subscriber client.
 */
export function getRedisSubscriber(): Redis & { quit: never } {
  if (!globalRedis) {
    throw new Error('Redis not initialized');
  }
  if (!redisSubscribers) {
    redisSubscribers = new Set();
  }

  const subscriber = globalRedis.duplicate();
  redisSubscribers.add(subscriber);

  subscriber.on('end', () => {
    redisSubscribers?.delete(subscriber);
  });

  return subscriber as Redis & { quit: never };
}

/**
 * @returns The amount of active `Redis` subscriber instances.
 */
export function getRedisSubscriberCount(): number {
  return redisSubscribers?.size ?? 0;
}
