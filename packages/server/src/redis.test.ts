// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import { loadTestConfig } from './config/loader';
import { MedplumServerConfig } from './config/types';
import { closeRedis, getRedis, getRedisSubscriber, getRedisSubscriberCount, initRedis } from './redis';
import { deleteRedisKeys } from './test.setup';

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

  // `deleteRedisKeys` is for tests only (i.e. in test.setup.ts), so testing it is a bit meta,
  // but the function is just complicated enough that it testing is merited
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
