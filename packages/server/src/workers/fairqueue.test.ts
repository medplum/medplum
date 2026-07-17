// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ILogger } from '@medplum/core';
import { randomUUID } from 'node:crypto';
import type { Mock } from 'vitest';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { globalLogger } from '../logger';
import type { AuthState } from '../oauth/middleware';
import { getRateLimitRedis } from '../redis';
import { deleteRedisKeys } from '../test.setup';
import { decrementProjectJobCount, incrementProjectJobPriority, isFairQueueEnabled } from './fairqueue';

const KEY_PREFIX = 'medplum:fairqueue:';

describe('Fair queue counter', () => {
  const queueName = 'TestQueue';
  const logger: ILogger = globalLogger;
  let errorSpy: Mock<(typeof logger)['error']>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await deleteRedisKeys(getRateLimitRedis(), KEY_PREFIX);
  });

  afterAll(async () => {
    await shutdownApp();
    errorSpy.mockRestore();
  });

  test('increment returns a monotonically increasing priority and sets a TTL', async () => {
    const projectId = randomUUID();
    // The Nth in-flight job for a project gets priority N (a lower number = higher priority).
    expect(await incrementProjectJobPriority(logger, queueName, projectId)).toStrictEqual(1);
    expect(await incrementProjectJobPriority(logger, queueName, projectId)).toStrictEqual(2);
    expect(await incrementProjectJobPriority(logger, queueName, projectId)).toStrictEqual(3);

    const ttl = await getRateLimitRedis().pttl(`${KEY_PREFIX}${queueName}:${projectId}`);
    expect(ttl).toBeGreaterThan(0);
  });

  test('increment counters are isolated per project', async () => {
    const projectA = randomUUID();
    const projectB = randomUUID();
    expect(await incrementProjectJobPriority(logger, queueName, projectA)).toStrictEqual(1);
    expect(await incrementProjectJobPriority(logger, queueName, projectA)).toStrictEqual(2);
    expect(await incrementProjectJobPriority(logger, queueName, projectB)).toStrictEqual(1);
  });

  test('decrement reduces the count and keeps the zeroed key TTL-bounded', async () => {
    const projectId = randomUUID();
    const key = `${KEY_PREFIX}${queueName}:${projectId}`;
    await incrementProjectJobPriority(logger, queueName, projectId);
    await incrementProjectJobPriority(logger, queueName, projectId);

    await decrementProjectJobCount(logger, queueName, projectId);
    expect(await getRateLimitRedis().get(key)).toStrictEqual('1');

    await decrementProjectJobCount(logger, queueName, projectId);
    // At zero the key remains but stays TTL-bounded, so it self-expires rather than lingering.
    expect(await getRateLimitRedis().get(key)).toStrictEqual('0');
    expect(await getRateLimitRedis().pttl(key)).toBeGreaterThan(0);
  });

  test('decrement of an absent counter sets a TTL so a stray negative self-expires', async () => {
    const projectId = randomUUID();
    const key = `${KEY_PREFIX}${queueName}:${projectId}`;
    await decrementProjectJobCount(logger, queueName, projectId);
    // DECR on a missing key would otherwise recreate it at -1 with no expiry; the pipelined EXPIRE
    // bounds it so it cannot linger forever.
    expect(await getRateLimitRedis().get(key)).toStrictEqual('-1');
    expect(await getRateLimitRedis().pttl(key)).toBeGreaterThan(0);
  });
});

describe('isFairQueueEnabled', () => {
  const baseAuthState = { project: { resourceType: 'Project', id: randomUUID() } } as unknown as AuthState;

  beforeAll(async () => {
    await loadTestConfig();
  });

  test('defaults to disabled when neither config nor project override is set', () => {
    getConfig().asyncBatchFairQueueEnabled = undefined;
    expect(isFairQueueEnabled(baseAuthState)).toBe(false);
  });

  test('honors the server config flag when no project override is present', () => {
    getConfig().asyncBatchFairQueueEnabled = true;
    expect(isFairQueueEnabled(baseAuthState)).toBe(true);
    getConfig().asyncBatchFairQueueEnabled = undefined;
  });

  test('project systemSetting override wins over the server config flag', () => {
    getConfig().asyncBatchFairQueueEnabled = false;
    const authState = {
      project: {
        resourceType: 'Project',
        id: randomUUID(),
        systemSetting: [{ name: 'asyncBatchFairQueueEnabled', valueBoolean: true }],
      },
    } as unknown as AuthState;
    expect(isFairQueueEnabled(authState)).toBe(true);

    const disabledAuthState = {
      project: {
        resourceType: 'Project',
        id: randomUUID(),
        systemSetting: [{ name: 'asyncBatchFairQueueEnabled', valueBoolean: false }],
      },
    } as unknown as AuthState;
    getConfig().asyncBatchFairQueueEnabled = undefined;
    expect(isFairQueueEnabled(disabledAuthState)).toBe(false);
  });
});
