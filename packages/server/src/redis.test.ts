// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import { loadTestConfig } from './config/loader';
import type { MedplumServerConfig } from './config/types';
import {
  closeRedis,
  getAllRedisInstances,
  getCacheRedis,
  getPubSubRedis,
  getPubSubRedisSubscriber,
  getPubSubRedisSubscriberCount,
  getRateLimitRedis,
  initRedis,
  reconnectOnError,
} from './redis';
import { deleteRedisKeys } from './test.setup';

describe('Redis', () => {
  let config: MedplumServerConfig;

  beforeAll(async () => {
    config = await loadTestConfig();
  });

  test('Get redis', async () => {
    initRedis(config);
    expect(getCacheRedis()).toBeDefined();
    await closeRedis();
  });

  test('Not initialized', async () => {
    expect(() => getCacheRedis()).toThrow();
    expect(() => getRateLimitRedis()).toThrow();
    expect(() => getPubSubRedis()).toThrow();
    await expect(closeRedis()).resolves.toBeUndefined();
  });

  test('Throws when closing', async () => {
    initRedis(config);
    // closeRedis sets closing=true synchronously before the first await
    const closePromise = closeRedis();
    expect(() => getCacheRedis()).toThrow('Redis is closing');
    expect(() => getRateLimitRedis()).toThrow('Redis is closing');
    expect(() => getPubSubRedis()).toThrow('Redis is closing');
    expect(() => getPubSubRedisSubscriber()).toThrow('Redis is closing');
    await closePromise;
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

  describe('Separate Redis instances', () => {
    test('Init with all separate configs', async () => {
      const separateConfig: MedplumServerConfig = {
        ...config,
        cacheRedis: { ...config.redis },
        rateLimitRedis: { ...config.redis },
        pubsubRedis: { ...config.redis },
        backgroundJobsRedis: { ...config.redis },
      };
      initRedis(separateConfig);

      const cache = getCacheRedis();
      const rateLimit = getRateLimitRedis();
      const pubsub = getPubSubRedis();

      expect(cache).toBeDefined();
      expect(rateLimit).toBeDefined();
      expect(pubsub).toBeDefined();

      // When separate instances are configured, they should be different from each other
      expect(cache).not.toBe(rateLimit);
      expect(cache).not.toBe(pubsub);

      await closeRedis();
    });

    test('Fallback to default when separate configs not set', async () => {
      const defaultOnlyConfig: MedplumServerConfig = {
        ...config,
        cacheRedis: undefined,
        rateLimitRedis: undefined,
        pubsubRedis: undefined,
        backgroundJobsRedis: undefined,
      };
      initRedis(defaultOnlyConfig);

      // All should fall back to the default instance
      const cache = getCacheRedis();
      const rateLimit = getRateLimitRedis();
      const pubsub = getPubSubRedis();

      expect(cache).toBe(rateLimit);
      expect(cache).toBe(pubsub);

      await closeRedis();
    });

    test('getPubSubRedisSubscriber uses pubsub instance when configured', async () => {
      const separateConfig: MedplumServerConfig = {
        ...config,
        pubsubRedis: { ...config.redis },
      };
      initRedis(separateConfig);

      const subscriber = getPubSubRedisSubscriber();
      expect(subscriber).toBeInstanceOf(Redis);
      expect(getPubSubRedisSubscriberCount()).toStrictEqual(1);

      await closeRedis();
    });
  });

  describe('getAllRedisInstances', () => {
    test('Returns only default when no separate configs', async () => {
      const defaultOnlyConfig: MedplumServerConfig = {
        ...config,
        cacheRedis: undefined,
        rateLimitRedis: undefined,
        pubsubRedis: undefined,
        backgroundJobsRedis: undefined,
      };
      initRedis(defaultOnlyConfig);

      const instances = getAllRedisInstances();
      expect(instances).toHaveLength(1);
      expect(instances[0].label).toStrictEqual('default');

      await closeRedis();
    });

    test('Returns all configured instances', async () => {
      const separateConfig: MedplumServerConfig = {
        ...config,
        cacheRedis: { ...config.redis },
        rateLimitRedis: { ...config.redis },
        pubsubRedis: { ...config.redis },
        backgroundJobsRedis: { ...config.redis },
      };
      initRedis(separateConfig);

      const instances = getAllRedisInstances();
      expect(instances).toHaveLength(5);
      const labels = instances.map((i) => i.label);
      expect(labels).toContain('default');
      expect(labels).toContain('cache');
      expect(labels).toContain('rateLimit');
      expect(labels).toContain('pubsub');
      expect(labels).toContain('backgroundJobs');

      await closeRedis();
    });

    test('Returns empty when not initialized', async () => {
      const instances = getAllRedisInstances();
      expect(instances).toHaveLength(0);
    });
  });

  describe('getRedisSubscriber', () => {
    test('Not initialized', async () => {
      await closeRedis();
      expect(() => getPubSubRedisSubscriber()).toThrow();
    });

    test('Getting a subscriber', async () => {
      initRedis(config);
      const subscriber = getPubSubRedisSubscriber();
      expect(subscriber).toBeInstanceOf(Redis);
      await closeRedis();
    });

    test('Hanging subscriber still disconnects on closeRedis', async () => {
      initRedis(config);
      const subscriber = getPubSubRedisSubscriber();

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
      initRedis(config);
      expect(getPubSubRedisSubscriberCount()).toStrictEqual(0);
      const subscriber = getPubSubRedisSubscriber();
      expect(getPubSubRedisSubscriberCount()).toStrictEqual(1);
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
      expect(getPubSubRedisSubscriberCount()).toStrictEqual(0);
      clearTimeout(timer);

      await closeRedis();
    });
  });

  // `deleteRedisKeys` is for tests only (i.e. in test.setup.ts), so testing it is a bit meta,
  // but the function is just complicated enough that testing is merited
  describe('deleteRedisKeys', () => {
    let r1: Redis | undefined;
    let r2: Redis | undefined;

    afterEach(async () => {
      if (r1) {
        await r1.quit();
        r1 = undefined;
      }
      if (r2) {
        await r2.quit();
        r2 = undefined;
      }
    });

    test('Deletes keys by prefix', async () => {
      const config1 = await loadTestConfig();
      const config2 = await loadTestConfig();
      config1.redis.db = 8;
      config2.redis.db = 8;

      const prefix1 = randomUUID() + ':';
      const prefix2 = randomUUID() + ':';

      r1 = new Redis({ ...config1.redis, keyPrefix: prefix1 });
      r2 = new Redis({ ...config2.redis, keyPrefix: prefix2 });

      await r1.set('key1', 'r1.val1');
      await r1.set('key2', 'r1.val2');
      await r1.set('key3', 'r1.val3');
      await r1.set('key4', 'r1.val4');
      await r1.set('key5', 'r1.val5');

      await r2.set('key1', 'r2.val1');

      await expect(r1.get('key1')).resolves.toEqual('r1.val1');
      await expect(r2.get('key1')).resolves.toEqual('r2.val1');

      await expect(deleteRedisKeys(r1, prefix1)).resolves.toEqual(5);

      await expect(r1.get('key1')).resolves.toBeNull();
      await expect(r2.get('key1')).resolves.toEqual('r2.val1');

      await expect(deleteRedisKeys(r2, prefix2)).resolves.toEqual(1);

      await expect(r1.get('key1')).resolves.toBeNull();
      await expect(r2.get('key1')).resolves.toBeNull();
    });
  });
});
