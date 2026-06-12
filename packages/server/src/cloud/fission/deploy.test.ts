// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { deployFissionBot } from './deploy';
import type * as FissionUtils from './utils';
import { vi } from 'vitest';

vi.mock('./utils', async (importOriginal) => {
  const actual = await importOriginal<typeof FissionUtils>();
  return {
    ...actual,
    deployFissionFunction: vi.fn().mockResolvedValue(undefined),
  };
});

describe('Deploy Fission bots', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.fission = {
      namespace: 'default',
      fieldManager: 'medplum-fission-example',
      environmentName: 'nodejs',
      routerHost: 'localhost',
      routerPort: 31314,
    };
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
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

    const code = `
    export async function handler() {
      console.log('input', input);
      return input;
    }
    `;

    await expect(deployFissionBot(bot, code)).resolves.toBeUndefined();
  });
});
