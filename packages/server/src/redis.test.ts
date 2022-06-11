import { vi } from 'vitest';
import { loadTestConfig } from './config';
import { closeRedis, getRedis, initRedis } from './redis';

vi.mock('ioredis');

describe('Redis', () => {
  test('Get redis', async () => {
    const config = await loadTestConfig();
    await initRedis(config.redis);
    expect(getRedis()).toBeDefined();
    await closeRedis();
  });

  test('Not initialized', () => {
    expect(() => getRedis()).toThrow();
    expect(() => closeRedis()).not.toThrow();
  });
});
