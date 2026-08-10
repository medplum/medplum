// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { generateId, OperationOutcomeError } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { vi } from 'vitest';
import { loadTestConfig } from '../config/loader';
import { closeRedis, getCacheRedis, initRedis } from '../redis';
import type { FhircastSubscription } from './utils';
import {
  deleteEndpointSubscription,
  extractEndpoint,
  FHIRCAST_LEASE_SECONDS,
  getEndpointSubscription,
  getEndpointSubscriptionKey,
  getTopicForUser,
  parseFhircastEvents,
  setEndpointSubscription,
} from './utils';

describe('FHIRcast Utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    initRedis(config);
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
      await getCacheRedis().set(`medplum:fhircast:topic:${userId}`, topic);

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
        expire(_key: string, _seconds: number): this {
          return this;
        }
        async exec(): Promise<null> {
          return null;
        }
      }
      const redis = getCacheRedis();
      const originalMulti = redis.multi;
      const mockMulti = vi.fn(() => new MockCommander());
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
        expire(_key: string, _seconds: number): this {
          return this;
        }
        async exec(): Promise<(null | [Error, string | null])[]> {
          return [null, [new Error('Something went wrong!'), null]];
        }
      }
      const redis = getCacheRedis();
      const originalMulti = redis.multi;
      const mockMulti = vi.fn(() => new MockCommander());
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

  describe('parseFhircastEvents', () => {
    test.each([
      ['Patient-open,Patient-close', ['Patient-open', 'Patient-close']],
      ['Patient-open, Patient-close', ['Patient-open', 'Patient-close']],
      [' Patient-open , Patient-close ', ['Patient-open', 'Patient-close']],
      ['Patient-open', ['Patient-open']],
      // Only a comma separates events, so a space-separated list is one (unmatchable) name
      ['Patient-open Patient-close', ['Patient-open Patient-close']],
      ['', []],
      [undefined, []],
    ])('%j -> %j', (events, expected) => {
      expect(parseFhircastEvents(events)).toStrictEqual(expected);
    });
  });

  describe('extractEndpoint', () => {
    test.each([
      ['ws://localhost:8103/ws/fhircast/abc-123', 'abc-123'],
      ['abc-123', 'abc-123'],
      // Neither a query string, a fragment, nor a trailing slash is part of the endpoint
      ['ws://localhost:8103/ws/fhircast/abc-123?token=xyz', 'abc-123'],
      ['ws://localhost:8103/ws/fhircast/abc-123#frag', 'abc-123'],
      ['ws://localhost:8103/ws/fhircast/abc-123/', 'abc-123'],
      ['', undefined],
      ['?token=xyz', undefined],
      [undefined, undefined],
    ])('%j -> %j', (endpointUrl, expected) => {
      expect(extractEndpoint(endpointUrl)).toStrictEqual(expected);
    });
  });

  describe('Endpoint subscriptions', () => {
    test('Set, get, and delete a subscription', async () => {
      const endpoint = generateId();
      const subscription: FhircastSubscription = {
        projectId: generateId(),
        topic: generateId(),
        events: ['Patient-open'],
        version: 'STU3',
      };

      await expect(getEndpointSubscription(endpoint)).resolves.toBeUndefined();

      await setEndpointSubscription(endpoint, subscription);
      await expect(getEndpointSubscription(endpoint)).resolves.toStrictEqual(subscription);
      // The subscription expires with the lease the Hub advertises to the subscriber
      await expect(getCacheRedis().ttl(getEndpointSubscriptionKey(endpoint))).resolves.toBeLessThanOrEqual(
        FHIRCAST_LEASE_SECONDS
      );

      await deleteEndpointSubscription(endpoint);
      await expect(getEndpointSubscription(endpoint)).resolves.toBeUndefined();
    });

    // A value the Hub cannot read is no better than no subscription, and callers already deny that
    test.each([
      ['not json at all'],
      [JSON.stringify({ projectId: generateId() })],
      [JSON.stringify({ projectId: generateId(), topic: generateId(), events: [42], version: 'STU3' })],
      [JSON.stringify({ projectId: generateId(), topic: generateId(), events: [], version: 'STU4' })],
    ])('A cached subscription of %j reads as no subscription', async (cached) => {
      const endpoint = generateId();
      await getCacheRedis().set(getEndpointSubscriptionKey(endpoint), cached);
      await expect(getEndpointSubscription(endpoint)).resolves.toBeUndefined();
    });
  });
});
