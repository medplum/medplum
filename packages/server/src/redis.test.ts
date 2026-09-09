import { Redis } from 'ioredis';
import { loadTestConfig } from './config/loader';
import { MedplumServerConfig } from './config/types';
import {
  closeRedis,
  getRedis,
  getRedisSubscriber,
  getRedisSubscriberCount,
  initRedis,
  reconnectOnError,
} from './redis';

describe('Redis', () => {
  let config: MedplumServerConfig;

  beforeAll(async () => {
    config = await loadTestConfig();
  });

  test('Get redis', async () => {
    initRedis(config.redis);
    expect(getRedis()).toBeDefined();
    await closeRedis();
  });

  test('Not initialized', async () => {
    expect(() => getRedis()).toThrow();
    await expect(closeRedis()).resolves.toBeUndefined();
  });

  describe('reconnectOnError', () => {
    test('Returns 2 for READONLY error', () => {
      expect(reconnectOnError(new Error("READONLY You can't write against a read only replica"))).toBe(2);
    });

    test('Returns 2 for LOADING error', () => {
      expect(reconnectOnError(new Error('LOADING Redis is loading the dataset in memory'))).toBe(2);
    });

    test('Returns false for other errors', () => {
      expect(reconnectOnError(new Error('NOAUTH Authentication required'))).toBe(false);
    });
  });

  describe('getRedisSubscriber', () => {
    test('Not initialized', async () => {
      await closeRedis();
      expect(() => getRedisSubscriber()).toThrow();
    });

    test('Getting a subscriber', async () => {
      initRedis(config.redis);
      const subscriber = getRedisSubscriber();
      expect(subscriber).toBeInstanceOf(Redis);
      await closeRedis();
    });

    test('Hanging subscriber still disconnects on closeRedis', async () => {
      initRedis(config.redis);
      const subscriber = getRedisSubscriber();

      let reject: (err: Error) => void;
      const closePromise = new Promise<void>((resolve, _reject) => {
        subscriber.on('end', () => {
          resolve();
        });
        reject = _reject;
      });

      expect(subscriber).toBeDefined();
      await closeRedis();

      const timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(closePromise).resolves.toBeUndefined();
      clearTimeout(timer);
    });

    test('Disconnecting a subscriber removes it from the list', async () => {
      initRedis(config.redis);
      expect(getRedisSubscriberCount()).toStrictEqual(0);
      const subscriber = getRedisSubscriber();
      expect(getRedisSubscriberCount()).toStrictEqual(1);
      subscriber.disconnect();

      let reject: (err: Error) => void;
      const closePromise = new Promise<void>((resolve, _reject) => {
        subscriber.on('end', () => {
          resolve();
        });
        reject = _reject;
      });

      expect(subscriber).toBeDefined();
      await closeRedis();

      const timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, 3500);

      await expect(closePromise).resolves.toBeUndefined();
      expect(getRedisSubscriberCount()).toStrictEqual(0);
      clearTimeout(timer);

      await closeRedis();
    });
  });
});
