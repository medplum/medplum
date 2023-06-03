import Redis from 'ioredis';
import { MedplumRedisConfig } from './config';

let redis: Redis | undefined = undefined;

export function initRedis(config: MedplumRedisConfig): void {
  try {
    // redis = new Redis(config);
    redis = new Redis({
      ...config,
      retryStrategy: (times) => {
        const maxRetries = 10;
        if (times <= maxRetries) {
          console.log(`Retrying connection to Redis (${times}/${maxRetries})`);
          return 1000; // Retry after 1 second
        }
        return null; // Stop retrying after reaching maximum attempts
      },
    });

    redis.on('ready', () => {
      console.log('Connected to Redis');
    });

    redis.on('error', () => {
      console.error('Redis connection error:');
    });
  } catch (err) {
    console.log('redis down');
  }
}

export function closeRedis(): void {
  if (redis) {
    redis.disconnect();
    redis = undefined;
  }
}

export function getRedis(): Redis {
  if (!redis) {
    throw new Error('Redis not initialized');
  }
  return redis;
}
