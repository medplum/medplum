import { loadTestConfig } from './config';
import { closeRedis, getRedis, initRedis } from './redis';

jest.mock('ioredis');

describe('Redis', () => {
  test('Get redis', async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    expect(getRedis()).toBeDefined();
    closeRedis();
  });

  test('Not initialized', () => {
    expect(() => getRedis()).toThrow();
    expect(() => closeRedis()).not.toThrow();
  });
});
