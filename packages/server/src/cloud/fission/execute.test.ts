// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { WithId } from '@medplum/core';
import { Bot, ProjectMembership } from '@medplum/fhirtypes';
import express from 'express';
import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { MedplumServerConfig } from '../../config/types';
import { initTestAuth } from '../../test.setup';
import { executeFissionBot } from './execute';

jest.mock('node-fetch');

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
    (fetch as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Success', async () => {
    const bot: WithId<Bot> = {
      resourceType: 'Bot',
      id: randomUUID(),
      name: 'Test Bot',
      runtimeVersion: 'fission',
    };

    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      ok: true,
      text: jest.fn(async () =>
        JSON.stringify({ success: true, logResult: '', returnValue: { result: 'test result' } })
      ),
    }));

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

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`bot-${bot.id}`),
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('Error', async () => {
    const bot: WithId<Bot> = {
      resourceType: 'Bot',
      id: randomUUID(),
      name: 'Test Bot',
      runtimeVersion: 'fission',
    };

    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 400,
      ok: false,
      text: jest.fn(async () =>
        JSON.stringify({ success: false, logResult: 'unhandled error', returnValue: { result: 'unhandled error' } })
      ),
    }));

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

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(`bot-${bot.id}`),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
