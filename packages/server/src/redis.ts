import { sleep } from '@medplum/core';
import Redis from 'ioredis';
import { MedplumRedisConfig } from './config';

let redis: Redis | undefined = undefined;

export function initRedis(config: MedplumRedisConfig): void {
  redis = new Redis(config);
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    const tmpRedis = redis;
    redis = undefined;
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
 * Instead duplicate instances for `subscriber` mode `redis` clients should only be obtained by calling
 *
 * See: {@link getRedisSubscriber}
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
 * Gets a `Redis` instance for use in client mode.
 *
 * The synchronous `.disconnect()` on this instance should be called instead of `.quit()` when you want to disconnect.
 *
 * @returns A `Redis` instance to use as a subscriber client.
 */
export function getRedisSubscriber(): Redis & { quit: never } {
  if (!redis) {
    throw new Error('Redis not initialized');
  }
  // @ts-expect-error We don't want anyone to call `.quit()` on duplicate clients
  // because it can lead to being unable to gracefully quit the global instance client later
  return redis.duplicate();
}
