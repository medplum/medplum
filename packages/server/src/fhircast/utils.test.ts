import { generateId } from '@medplum/core';
import { loadTestConfig } from '../config';
import { closeRedis, getRedis, initRedis } from '../redis';
import { getTopicForUser } from './utils';

describe('FHIRcast Utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
    expect(getRedis()).toBeDefined();
    await getRedis().flushdb();
  });

  afterAll(async () => {
    await closeRedis();
  });

  describe('getTopicForUser', () => {
    test("User doesn't have an existing topic", async () => {
      const userId = generateId();
      await expect(getTopicForUser(userId)).resolves.toBeDefined();
    });

    test('User has existing topic', async () => {
      const userId = generateId();
      const topic = generateId();
      await getRedis().set(`medplum:fhircast:topic:${userId}`, topic);

      await expect(getTopicForUser(userId)).resolves.toBe(topic);
    });
  });
});
