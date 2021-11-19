import { loadTestConfig } from './config';
import { closeRedis, getRedis, initRedis } from './redis';

describe('Redis', () => {

  test('Get redis', async () => {
    const config = await loadTestConfig();
    await initRedis(config.redis);
    expect(getRedis()).not.toBeUndefined();
    await closeRedis();
  });

  test('Not initialized', () => {
    expect(() => getRedis()).toThrow();
    expect(() => closeRedis()).not.toThrow();
  });

});
