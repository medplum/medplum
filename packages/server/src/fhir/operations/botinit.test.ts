// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, ContentType, streamToBuffer } from '@medplum/core';
import type { Binary } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { MedplumServerConfig } from '../../config/types';
import { getBinaryStorage } from '../../storage/loader';
import { createTestProject } from '../../test.setup';
import type { Repository } from '../repo';

const app = express();

describe('Bot $init', () => {
  let config: MedplumServerConfig;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Require project admin', async () => {
    const { accessToken } = await createTestProject({ withAccessToken: true });
    const res2 = await request(app)
      .post('/fhir/R4/Bot/$init')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
      });
    expect(res2.status).toBe(403);
  });

  test('Missing both data and url', async () => {
    const { accessToken } = await createTestProject({
      membership: { admin: true },
      withAccessToken: true,
    });
    const res2 = await request(app)
      .post('/fhir/R4/Bot/$init')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
        sourceCode: { title: 'missing data and url', contentType: ContentType.JAVASCRIPT },
      });
    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject(badRequest('Invalid attachment: Missing data or url'));
  });

  test('Invalid base-64 data', async () => {
    const { accessToken } = await createTestProject({
      membership: { admin: true },
      withAccessToken: true,
    });
    const res2 = await request(app)
      .post('/fhir/R4/Bot/$init')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
        sourceCode: { title: 'invalid base-64 data', contentType: ContentType.JAVASCRIPT, data: 'invalid-base64' },
      });
    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject(badRequest('Invalid attachment: Invalid base64 data'));
  });

  test('Create new bot', async () => {
    const { accessToken } = await createTestProject({
      membership: { admin: true },
      withAccessToken: true,
    });

    // Next, Alice creates a bot
    const res2 = await request(app)
      .post('/fhir/R4/Bot/$init')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
      });
    expect(res2.status).toBe(201);
    expect(res2.body.resourceType).toBe('Bot');
    expect(res2.body.id).toBeDefined();
    expect(res2.body.code).toBeUndefined();
    expect(res2.body.sourceCode).toBeDefined();
    expect(res2.body.executableCode).toBeUndefined();

    // Read the bot
    const res3 = await request(app)
      .get('/fhir/R4/Bot/' + res2.body.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.resourceType).toBe('Bot');
    expect(res3.body.id).toBe(res2.body.id);

    // Create bot with invalid name (should fail)
    const res4 = await request(app)
      .post('/fhir/R4/Bot/$init')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({ foo: 'bar' });
    expect(res4.status).toBe(400);
  });

  test('Create bot with base-64 source code', async () => {
    const sourceCode = `
    export async function handler(medplum, event) {
      console.log(JSON.stringify(event));
      return event.input;
    }
    `;

    const executableCode = `
    exports.handler = async function (medplum, event) {
      console.log(JSON.stringify(event));
      return event.input;
    };
    `;

    const { accessToken, repo } = await createTestProject({
      membership: { admin: true },
      withAccessToken: true,
      withRepo: true,
    });

    // Next, Alice creates a bot
    const res2 = await request(app)
      .post('/fhir/R4/Bot/$init')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
        sourceCode: {
          contentType: ContentType.TYPESCRIPT,
          title: 'index.ts',
          data: Buffer.from(sourceCode).toString('base64'),
        },
        executableCode: {
          contentType: ContentType.JAVASCRIPT,
          title: 'index.js',
          data: Buffer.from(executableCode).toString('base64'),
        },
      });
    expect(res2.status).toBe(201);
    expect(res2.body.resourceType).toBe('Bot');
    expect(res2.body.id).toBeDefined();
    expect(res2.body.code).toBeUndefined();
    expect(res2.body.sourceCode).toBeDefined();
    expect(res2.body.executableCode).toBeDefined();

    const sourceCodeCheck = await readBinaryContent(repo, extractBinaryId(res2.body.sourceCode.url));
    expect(sourceCodeCheck).toBe(sourceCode);

    const executableCodeCheck = await readBinaryContent(repo, extractBinaryId(res2.body.executableCode.url));
    expect(executableCodeCheck).toBe(executableCode);
  });
});

function extractBinaryId(url: string): string {
  return url.replace('http://localhost:8103/storage/', '').split('/')?.[0];
}

async function readBinaryContent(repo: Repository, binaryId: string): Promise<string> {
  const binary = await repo.readResource<Binary>('Binary', binaryId);
  const stream = await getBinaryStorage().readBinary(binary);
  const content = await streamToBuffer(stream);
  return content.toString();
}
