// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Bot, ProjectMembership } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { MedplumServerConfig } from '../../config/types';
import { initTestAuth } from '../../test.setup';
import { executeFissionBot } from './execute';
import type * as FissionUtils from './utils';
import { vi } from 'vitest';

const { mockExecuteFissionFunction } = vi.hoisted(() => ({
  mockExecuteFissionFunction: vi.fn(),
}));

vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal<typeof FissionUtils>();
  return {
    ...actual,
    executeFissionFunction: mockExecuteFissionFunction,
  };
});

describe('Execute Fission bots', () => {
  const app = express();
  let config: MedplumServerConfig;
  let accessToken: string;

  beforeAll(async () => {
    config = await loadTestConfig();
    config.fission = {
      namespace: 'default',
      fieldManager: 'medplum-fission-example',
      environmentName: 'nodejs',
      routerHost: 'localhost',
      routerPort: 31314,
    };
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    mockExecuteFissionFunction.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('Success', async () => {
    const bot: WithId<Bot> = {
      resourceType: 'Bot',
      id: randomUUID(),
      name: 'Test Bot',
      runtimeVersion: 'fission',
    };

    mockExecuteFissionFunction.mockResolvedValueOnce(
      JSON.stringify({ success: true, logResult: '', returnValue: { result: 'test result' } })
    );

    await expect(
      executeFissionBot({
        bot,
        runAs: {} as WithId<ProjectMembership>,
        accessToken,
        input: 'test input',
        contentType: 'text/plain',
        secrets: {},
        traceId: randomUUID(),
        headers: {},
      })
    ).resolves.toMatchObject({
      success: true,
      returnValue: { result: 'test result' },
    });

    expect(mockExecuteFissionFunction).toHaveBeenCalledWith(bot.id, expect.any(String));
  });

  test('Error', async () => {
    const bot: WithId<Bot> = {
      resourceType: 'Bot',
      id: randomUUID(),
      name: 'Test Bot',
      runtimeVersion: 'fission',
    };

    mockExecuteFissionFunction.mockRejectedValueOnce(
      new Error('HTTP error! Status: 400, Message: {"success":false,"logResult":"unhandled error"}')
    );

    await expect(
      executeFissionBot({
        bot,
        runAs: {} as WithId<ProjectMembership>,
        accessToken,
        input: 'test input',
        contentType: 'text/plain',
        secrets: {},
        traceId: randomUUID(),
        headers: {},
      })
    ).resolves.toMatchObject({
      success: false,
    });

    expect(mockExecuteFissionFunction).toHaveBeenCalledWith(bot.id, expect.any(String));
  });
});
