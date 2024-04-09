import { sleep } from '@medplum/core';
import Redis from 'ioredis';
import { MedplumRedisConfig } from './config';

let redis: Redis | undefined = undefined;
let redisSubscribers: Set<Redis> | undefined = undefined;

export function initRedis(config: MedplumRedisConfig): void {
  redis = new Redis(config);
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    const tmpRedis = redis;
    const tmpSubscribers = redisSubscribers;
    redis = undefined;
    redisSubscribers = undefined;
    if (tmpSubscribers) {
      for (const subscriber of tmpSubscribers) {
        subscriber.disconnect();
      }
    }
    await tmpRedis.quit();
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
 * @returns The global `Redis` instance.
 */
export function getRedis(): Redis & { duplicate: never } {
  if (!redis) {
    throw new Error('Redis not initialized');
  }
  // @ts-expect-error We don't want anyone to call `duplicate on the redis global instance
  // This is because we want to gracefully `quit` and duplicated Redis instances will
  return redis;
}

/**
 * Gets a `Redis` instance for use in subscriber mode.
 *
 * The synchronous `.disconnect()` on this instance should be called instead of `.quit()` when you want to disconnect.
 *
 * @returns A `Redis` instance to use as a subscriber client.
 */
export function getRedisSubscriber(): Redis & { quit: never } {
  if (!redis) {
    throw new Error('Redis not initialized');
  }
  if (!redisSubscribers) {
    redisSubscribers = new Set();
  }

  const subscriber = redis.duplicate();
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
