// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { WithId } from '@medplum/core';
import { allOk, badRequest, parseJWTPayload, resolveId } from '@medplum/core';
import type { Bot, Login, ProjectMembership } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo, Repository } from '../fhir/repo';
import { getResourceCacheKey } from '../fhir/repository/resource-cache';
import { globalLogger } from '../logger';
import * as keysModule from '../oauth/keys';
import { getLoginForAccessToken, revokeLogin } from '../oauth/utils';
import { getCacheRedis } from '../redis';
import { createTestProject, withTestContext } from '../test.setup';
import type { BotExecutionRequest } from './types';
import {
  clearBotAccessTokenCache,
  getBotAccessToken,
  getJsFileExtension,
  logBotCallerSmartScopes,
  normalizeBotExecutionResult,
} from './utils';

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

describe('logBotCallerSmartScopes', () => {
  const message = 'Bot ran as a caller with SMART scopes';

  function makeRequest(callerLogin?: Partial<Login>): BotExecutionRequest {
    const user = { reference: 'User/' + randomUUID() };
    return {
      bot: { resourceType: 'Bot', id: randomUUID() },
      runAs: {
        resourceType: 'ProjectMembership',
        id: randomUUID(),
        project: { reference: 'Project/' + randomUUID() },
        user,
        profile: { reference: 'Practitioner/' + randomUUID() },
      },
      callerLogin: callerLogin && {
        resourceType: 'Login',
        user,
        authMethod: 'password',
        authTime: new Date().toISOString(),
        ...callerLogin,
      },
      entryPoint: 'execute',
      input: {},
      contentType: 'application/json',
    };
  }

  function logCalls(request: BotExecutionRequest, times = 1): unknown[] {
    const warnSpy = vi.spyOn(globalLogger, 'warn');
    try {
      for (let i = 0; i < times; i++) {
        logBotCallerSmartScopes(request);
      }
      return warnSpy.mock.calls.filter(([msg]) => msg === message).map(([, data]) => data);
    } finally {
      warnSpy.mockRestore();
    }
  }

  test('Logs SMART resource scopes once per window', () => {
    const request = makeRequest({ scope: 'openid patient/Observation.rs' });
    expect(logCalls(request, 3)).toStrictEqual([
      {
        botId: request.bot.id,
        runAsProject: resolveId(request.runAs.project),
        callerMembership: 'ProjectMembership/' + request.runAs.id,
        callerProfile: request.runAs.profile?.reference,
        scope: 'openid patient/Observation.rs',
        launch: undefined,
        entryPoint: 'execute',
        suppressed: 0,
      },
    ]);
  });

  test('Logs SMART App Launch context', () => {
    const launch = { reference: 'SmartAppLaunch/' + randomUUID() };
    expect(logCalls(makeRequest({ scope: 'openid', launch }))).toStrictEqual([
      expect.objectContaining({ scope: 'openid', launch: launch.reference }),
    ]);
  });

  test('Does not log without SMART scopes or caller', () => {
    expect(logCalls(makeRequest({ scope: 'openid offline_access' }))).toStrictEqual([]);
    expect(logCalls(makeRequest(undefined))).toStrictEqual([]);
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
      expect(authState?.login.meta?.project).toBe(resolveId(membership.project));
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
