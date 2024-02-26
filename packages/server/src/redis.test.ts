import { loadTestConfig } from './config';
import { closeRedis, getRedis, initRedis } from './redis';

describe('Redis', () => {
  test('Get redis', async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    expect(getRedis()).toBeDefined();
    await closeRedis();
  });

  test('Not initialized', async () => {
    expect(() => getRedis()).toThrow();
    await expect(closeRedis()).resolves.toBeUndefined();
  });
});
