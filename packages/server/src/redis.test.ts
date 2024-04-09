import { Redis } from 'ioredis';
import { MedplumServerConfig, loadTestConfig } from './config';
import { closeRedis, getRedis, getRedisSubscriber, initRedis } from './redis';

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
      subscriber.disconnect();
      await closeRedis();
    });
  });
});
