import Redis from 'ioredis';
import { MedplumRedisConfig } from './config';

let redis: Redis | undefined = undefined;

export function initRedis(config: MedplumRedisConfig): void {
  redis = new Redis(config);
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = undefined;
  }
}

export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized');
  }
  return redis;
}
