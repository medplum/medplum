import { OperationOutcomeError, generateId } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { loadTestConfig } from '../config';
import { closeRedis, getRedis, initRedis } from '../redis';
import { getTopicForUser } from './utils';

describe('FHIRcast Utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config.redis);
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

    test('Failed to get key from Redis', async () => {
      class MockCommander {
        set(..._args: any[]): this {
          return this;
        }
        get(_key: string): this {
          return this;
        }
        async exec(): Promise<null> {
          return null;
        }
      }
      const redis = getRedis();
      const originalMulti = redis.multi;
      const mockMulti = jest.fn(() => new MockCommander());
      // @ts-expect-error Replacing multi with partial mock implementation
      redis.multi = mockMulti;

      const userId = generateId();

      let err!: OperationOutcomeError;
      try {
        await getTopicForUser(userId);
        // Should not get here
        expect(true).toBeFalsy();
      } catch (_err: unknown) {
        err = _err as OperationOutcomeError;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(OperationOutcomeError);
      expect(err.outcome).toMatchObject<OperationOutcome>({
        resourceType: 'OperationOutcome',
        issue: [
          { severity: 'error', code: 'exception', diagnostics: expect.stringContaining('Failed to get value for') },
        ],
      });

      redis.multi = originalMulti;
    });

    test('Error during Redis transaction', async () => {
      class MockCommander {
        set(..._args: any[]): this {
          return this;
        }
        get(_key: string): this {
          return this;
        }
        async exec(): Promise<(null | [Error, string | null])[]> {
          return [null, [new Error('Something went wrong!'), null]];
        }
      }
      const redis = getRedis();
      const originalMulti = redis.multi;
      const mockMulti = jest.fn(() => new MockCommander());
      // @ts-expect-error Replacing multi with partial mock implementation
      redis.multi = mockMulti;

      const userId = generateId();

      let err!: OperationOutcomeError;
      try {
        await getTopicForUser(userId);
        // Should not get here
        expect(true).toBeFalsy();
      } catch (_err: unknown) {
        err = _err as OperationOutcomeError;
      }

      expect(err).toBeDefined();
      expect(err).toBeInstanceOf(OperationOutcomeError);
      expect(err.outcome).toMatchObject<OperationOutcome>({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'exception', diagnostics: 'Error: Something went wrong!' }],
      });

      redis.multi = originalMulti;
    });
  });
});
