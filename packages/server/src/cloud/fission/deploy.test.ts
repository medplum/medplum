// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import express from 'express';
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import * as fissionUtils from './utils';
import { deployFissionBot } from './deploy';

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
    jest.restoreAllMocks();
  });

  test('Success', async () => {
    const bot: WithId<Bot> = {
      resourceType: 'Bot',
      id: randomUUID(),
      name: 'Test Bot',
      runtimeVersion: 'fission',
    };

    const deploySpy = jest.spyOn(fissionUtils, 'deployFissionFunction').mockResolvedValue();

    const code = `
    export async function handler() {
      console.log('input', input);
      return input;
    }
    `;

    await expect(deployFissionBot(bot, code)).resolves.toBeUndefined();
    expect(deploySpy).toHaveBeenCalledWith(bot.id, expect.any(Uint8Array));

    const zipFile = deploySpy.mock.calls[0][1];
    const zip = await new JSZip().loadAsync(zipFile);
    const indexCode = await zip.file('index.js')?.async('string');
    expect(indexCode).toContain('returnValue: normalizeOperationOutcome(err)');
    expect(indexCode).toContain('status: 200');
  });
});
