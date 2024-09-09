import { Redis } from 'ioredis';
import { MedplumServerConfig, loadTestConfig } from './config';
import { closeRedis, getRedis, getRedisSubscriber, getRedisSubscriberCount, initRedis } from './redis';

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
      expect(getRedisSubscriberCount()).toEqual(0);
      const subscriber = getRedisSubscriber();
      expect(getRedisSubscriberCount()).toEqual(1);
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
      expect(getRedisSubscriberCount()).toEqual(0);
      clearTimeout(timer);

      await closeRedis();
    });
  });
});
