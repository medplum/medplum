// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { Binary, Bot } from '@medplum/fhirtypes';
import express from 'express';
import { randomUUID } from 'node:crypto';
import stream from 'node:stream';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import * as awsDeploy from '../../cloud/aws/deploy';
import { loadTestConfig } from '../../config/loader';
import * as storage from '../../storage/loader';
import { BinaryStorage } from '../../storage/types';
import { initTestAuth, withTestContext } from '../../test.setup';
import * as streamUtils from '../../util/streams';

const MOCK_PRESIGNED_URL = 'https://example.com/presigned';

class MockBinaryStorage {
  getPresignedUrl(): string {
    return MOCK_PRESIGNED_URL;
  }

  writeBinary(): Promise<void> {
    return Promise.resolve();
  }

  readBinary(): Promise<stream.Readable> {
    return Promise.resolve(new stream.Readable());
  }
}

const app = express();
let accessToken: string;

describe('Deploy', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  beforeEach(() => {
    jest
      .spyOn(awsDeploy, 'getLambdaTimeoutForBot')
      .mockImplementation(async (_bot: Bot) => awsDeploy.DEFAULT_LAMBDA_TIMEOUT);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Deploy bot with executableCode attached', async () => {
    const code = `
    export async function handler() {
      console.log('input', input);
      return input;
    }
    `;

    const mockBinaryStorage = new MockBinaryStorage();
    jest.spyOn(storage, 'getBinaryStorage').mockImplementation(() => mockBinaryStorage as unknown as BinaryStorage);
    const binaryStorage = storage.getBinaryStorage();
    const readBinarySpy = jest.spyOn(binaryStorage, 'readBinary');

    const readStreamToStringSpy = jest
      .spyOn(streamUtils, 'readStreamToString')
      .mockImplementation(() => Promise.resolve(code));

    const deployLambdaSpy = jest.spyOn(awsDeploy, 'deployLambda').mockImplementation();

    // Create Binary to serve as storage for code attachment
    const res1 = await request(app)
      .post(`/fhir/R4/Binary`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Binary',
        contentType: ContentType.JAVASCRIPT,
      } satisfies Binary);
    expect(res1.status).toBe(201);

    const binary = res1.body as Binary;

    // Step 2: Create a bot
    const res2 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'awslambda',
        executableCode: { url: `Binary/${binary.id}` },
      } satisfies Bot);
    expect(res2.status).toBe(201);

    const bot = res2.body as Bot;

    // Step 3: Deploy the bot
    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);

    expect(readBinarySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'Binary',
        contentType: ContentType.JAVASCRIPT,
      } as Binary)
    );
    expect(readStreamToStringSpy).toHaveBeenCalledWith(expect.any(Object));
    expect(deployLambdaSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ...bot,
        executableCode: expect.objectContaining({ url: expect.any(String) }),
        meta: expect.objectContaining({ ...bot.meta, lastUpdated: expect.any(String), versionId: expect.any(String) }),
      }),
      code
    );
  });

  test('Deploy bot with code parameter', async () => {
    const deployLambdaSpy = jest.spyOn(awsDeploy, 'deployLambda').mockImplementation(jest.fn());

    const code = `
      export async function handler() {
        console.log('input', input);
        return input;
      }
      `;

    // Step 1: Create a bot
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'awslambda',
        code,
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as Bot;

    // Step 2: Deploy the bot with code parameter
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code,
      });
    expect(res2.status).toBe(200);
    expect(deployLambdaSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ...bot,
        executableCode: expect.objectContaining({ url: expect.any(String) }),
        meta: expect.objectContaining({ ...bot.meta, lastUpdated: expect.any(String), versionId: expect.any(String) }),
      }),
      code
    );
  });

  test('Deploy bot with missing code', async () => {
    // Step 1: Create a bot
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'awslambda',
        code: `
        export async function handler() {
          console.log('input', input);
          return input;
        }
        `,
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as Bot;

    // Step 2: Deploy the bot with missing code
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: '' });
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toStrictEqual('Bot missing executable code');
  });

  test('Bots not enabled', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    // Next, Alice creates a bot
    const res2 = await request(app)
      .post('/admin/projects/' + project.id + '/bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
      });
    expect(res2.status).toBe(201);
    expect(res2.body.resourceType).toBe('Bot');
    expect(res2.body.id).toBeDefined();
    expect(res2.body.sourceCode).toBeDefined();

    // Try to deploy the bot
    // This should fail because bots are not enabled
    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${res2.body.id}/$deploy`)
      .set('Content-Type', ContentType.JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        export async function handler() {
          console.log('input', input);
          return input;
        }
        `,
      });
    expect(res3.status).toBe(400);
    expect(res3.body.issue[0].details.text).toStrictEqual('Bots not enabled');
  });
});
