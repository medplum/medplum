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

export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized');
  }
  return redis;
}
