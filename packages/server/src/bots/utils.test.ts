// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import { allOk, badRequest, parseJWTPayload } from '@medplum/core';
import type { Bot, Login, ProjectMembership } from '@medplum/fhirtypes';
import express from 'express';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo, Repository } from '../fhir/repo';
import { getResourceCacheKey } from '../fhir/repository/resource-cache';
import * as keysModule from '../oauth/keys';
import { getLoginForAccessToken, revokeLogin } from '../oauth/utils';
import { getCacheRedis } from '../redis';
import { createTestProject, withTestContext } from '../test.setup';
import { clearBotAccessTokenCache, getBotAccessToken, getJsFileExtension, normalizeBotExecutionResult } from './utils';

describe('getJsFileExtension', () => {
  test('returns .cjs for CommonJS code with .cjs extension', () => {
    const bot = { id: '1', executableCode: { title: 'bot.cjs' } } as Bot;
    const code = 'module.exports = {};';
    expect(getJsFileExtension(bot, code)).toBe('.cjs');
  });

  test('returns .mjs for ESM code with .mjs extension', () => {
    const bot = { id: '1', executableCode: { title: 'bot.mjs' } } as Bot;
    const code = 'export const foo = 42;';
    expect(getJsFileExtension(bot, code)).toBe('.mjs');
  });

  test('returns .mjs for ESM code without extension', () => {
    const bot = { id: '1', executableCode: { title: 'bot.js' } } as Bot;
    const code = 'export const foo = 42;';
    expect(getJsFileExtension(bot, code)).toBe('.mjs');
  });

  test('returns .cjs for CommonJS code without extension', () => {
    const bot = { id: '1', executableCode: { title: 'bot.js' } } as Bot;
    const code = 'module.exports = {};';
    expect(getJsFileExtension(bot, code)).toBe('.cjs');
  });

  test('returns .mjs for ESM code without filename', () => {
    const bot = { id: '1' } as Bot;
    const code = 'export const foo = 42;';
    expect(getJsFileExtension(bot, code)).toBe('.mjs');
  });

  test('returns .cjs for CommonJS code without filename', () => {
    const bot = { id: '1' } as Bot;
    const code = 'module.exports = {};';
    expect(getJsFileExtension(bot, code)).toBe('.cjs');
  });

  test('returns .cjs for ambiguous code without filename', () => {
    const bot = { id: '1' } as Bot;
    const code = 'const foo = 42;';
    expect(getJsFileExtension(bot, code)).toBe('.cjs');
  });
});

describe('normalizeBotExecutionResult', () => {
  test('keeps success true for OK OperationOutcome return values', () => {
    expect(normalizeBotExecutionResult({ success: true, logResult: '', returnValue: allOk })).toMatchObject({
      success: true,
      returnValue: allOk,
    });
  });

  test('sets success false for non-OK OperationOutcome return values', () => {
    const outcome = badRequest('test');

    expect(normalizeBotExecutionResult({ success: true, logResult: '', returnValue: outcome })).toMatchObject({
      success: false,
      returnValue: outcome,
    });
  });

  test('does not reinterpret legacy runtime error objects', () => {
    const returnValue = { errorType: 'OperationOutcomeError', errorMessage: 'test' };

    expect(normalizeBotExecutionResult({ success: false, logResult: '', returnValue })).toMatchObject({
      success: false,
      returnValue,
    });
  });
});

describe('getBotAccessToken', () => {
  const bot = { resourceType: 'Bot', id: 'bot-1' } as WithId<Bot>;
  let membership: WithId<ProjectMembership>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(express(), config);
    ({ membership } = await createTestProject({ withClient: true }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    clearBotAccessTokenCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('Reuses token for the same membership', () =>
    withTestContext(async () => {
      const spy = vi.spyOn(keysModule, 'generateAccessToken');
      const token1 = await getBotAccessToken(bot, membership);
      const token2 = await getBotAccessToken(bot, membership);
      expect(token2).toBe(token1);
      expect(spy).toHaveBeenCalledTimes(1);

      const authState = (await getLoginForAccessToken(undefined, token2))?.authState;
      expect(authState?.membership.id).toBe(membership.id);
    }));

  test('New token when membership changes', () =>
    withTestContext(async () => {
      const token1 = await getBotAccessToken(bot, membership);
      const { membership: other } = await createTestProject({ withClient: true });
      const token2 = await getBotAccessToken(bot, other);
      expect(token2).not.toBe(token1);

      const updated = { ...membership, meta: { ...membership.meta, versionId: 'new-version' } };
      const token3 = await getBotAccessToken(bot, updated);
      expect(token3).not.toBe(token1);
    }));

  test('New token for a different bot on the same membership', () =>
    withTestContext(async () => {
      const otherBot = { resourceType: 'Bot', id: 'bot-2' } as WithId<Bot>;
      const token1 = await getBotAccessToken(bot, membership);
      const token2 = await getBotAccessToken(otherBot, membership);
      expect(token2).not.toBe(token1);
      expect(parseJWTPayload(token2).login_id).not.toBe(parseJWTPayload(token1).login_id);
      expect(await getBotAccessToken(bot, membership)).toBe(token1);
    }));

  test('New token when cached Login was evicted', () =>
    withTestContext(async () => {
      const token1 = await getBotAccessToken(bot, membership);
      const loginId = parseJWTPayload(token1).login_id as string;
      await getCacheRedis().del(getResourceCacheKey('Login', loginId));

      const token2 = await getBotAccessToken(bot, membership);
      expect(token2).not.toBe(token1);
      expect((await getLoginForAccessToken(undefined, token2))?.authState.membership.id).toBe(membership.id);
    }));

  test('New token when cached Login was revoked', () =>
    withTestContext(async () => {
      const systemRepo = getGlobalSystemRepo();
      const token1 = await getBotAccessToken(bot, membership);
      const login = await systemRepo.readResource<Login>('Login', parseJWTPayload(token1).login_id as string);
      await revokeLogin(systemRepo, login);

      const token2 = await getBotAccessToken(bot, membership);
      expect(token2).not.toBe(token1);
      expect((await getLoginForAccessToken(undefined, token2))?.authState.membership.id).toBe(membership.id);
    }));

  test('New token when reading cached Login fails transiently', () =>
    withTestContext(async () => {
      const token1 = await getBotAccessToken(bot, membership);
      vi.spyOn(Repository.prototype, 'readResource').mockRejectedValueOnce(new Error('Connection reset'));

      const token2 = await getBotAccessToken(bot, membership);
      expect(token2).not.toBe(token1);
      expect((await getLoginForAccessToken(undefined, token2))?.authState.membership.id).toBe(membership.id);
    }));

  test('Concurrent requests on a cold cache share one Login', () =>
    withTestContext(async () => {
      const spy = vi.spyOn(keysModule, 'generateAccessToken');
      const tokens = await Promise.all(Array.from({ length: 5 }, () => getBotAccessToken(bot, membership)));
      expect(new Set(tokens).size).toBe(1);
      expect(spy).toHaveBeenCalledTimes(1);
    }));

  test('Failed in-flight request is not reused', () =>
    withTestContext(async () => {
      vi.spyOn(keysModule, 'generateAccessToken').mockRejectedValueOnce(new Error('Signing failed'));
      const results = await Promise.allSettled([
        getBotAccessToken(bot, membership),
        getBotAccessToken(bot, membership),
      ]);
      expect(results.map((r) => r.status)).toStrictEqual(['rejected', 'rejected']);

      const token = await getBotAccessToken(bot, membership);
      expect((await getLoginForAccessToken(undefined, token))?.authState.membership.id).toBe(membership.id);
    }));

  test('New token after cache window expires', () =>
    withTestContext(async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const token1 = await getBotAccessToken(bot, membership);
      vi.advanceTimersByTime(29 * 60 * 1000);
      expect(await getBotAccessToken(bot, membership)).toBe(token1);
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(await getBotAccessToken(bot, membership)).not.toBe(token1);
    }));
});
