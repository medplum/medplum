// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  LambdaClient,
  ListLayerVersionsCommand,
  ListVersionsByFunctionCommand,
  ResourceConflictException,
  ResourceNotFoundException,
  TooManyRequestsException,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { allOk, badRequest, ContentType } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { randomUUID } from 'crypto';
import express from 'express';
import JSZip from 'jszip';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { globalLogger } from '../../logger';
import { createTestProject, waitFor } from '../../test.setup';
import {
  DEFAULT_LAMBDA_TIMEOUT,
  getLambdaNameForBot,
  getLambdaTimeoutForBot,
  LAMBDA_HANDLER,
  LAMBDA_RUNTIME,
} from './deploy';

const TEST_LAYER_ARN = 'arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1';

describe('Deploy', () => {
  const app = express();
  let accessToken: string;
  let projectId: string;
  let mockLambdaClient: AwsClientStub<LambdaClient>;

  /**
   * Creates a bot via the admin endpoint (which auto-creates a ProjectMembership),
   * then optionally updates it with additional properties like timeout.
   * @param botProps - Optional bot properties to set on the created bot.
   * @returns The created Bot resource.
   */
  async function createTestBot(botProps?: Partial<Bot>): Promise<Bot> {
    const res = await request(app)
      .post(`/admin/projects/${projectId}/bot`)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: botProps?.name ?? 'Test Bot',
        runtimeVersion: botProps?.runtimeVersion ?? 'awslambda',
      });
    expect(res.status).toBe(201);
    const bot = res.body as Bot;

    // If additional properties are needed (e.g. timeout, code), update the bot
    const { name: _name, runtimeVersion: _rv, resourceType: _rt, ...extraProps } = botProps ?? {};
    if (Object.keys(extraProps).length > 0) {
      const updateRes = await request(app)
        .put(`/fhir/R4/Bot/${bot.id}`)
        .set('Content-Type', ContentType.FHIR_JSON)
        .set('Authorization', 'Bearer ' + accessToken)
        .send({ ...bot, ...extraProps });
      expect(updateRes.status).toBe(200);
      return updateRes.body as Bot;
    }

    return bot;
  }

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const result = await createTestProject({ withAccessToken: true, membership: { admin: true } });
    accessToken = result.accessToken;
    projectId = result.project.id;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    const lambdaMap = new Map<string, Record<string, any>>();

    mockLambdaClient = mockClient(LambdaClient);

    mockLambdaClient.on(CreateFunctionCommand).callsFake(({ FunctionName, Timeout }) => {
      const lambdaConfig = {
        FunctionName,
        Timeout,
      };
      lambdaMap.set(FunctionName, lambdaConfig);
      return { Configuration: lambdaConfig };
    });

    mockLambdaClient.on(GetFunctionCommand).callsFake(({ FunctionName }) => {
      if (lambdaMap.has(FunctionName)) {
        const lambdaConfig = lambdaMap.get(FunctionName);
        return { Configuration: lambdaConfig };
      }
      // When the function is not found, a `ResourceNotFoundException` is thrown
      throw new ResourceNotFoundException({ $metadata: {}, message: 'Function not found' });
    });

    mockLambdaClient.on(GetFunctionConfigurationCommand).callsFake(({ FunctionName }) => {
      if (lambdaMap.has(FunctionName)) {
        const config = lambdaMap.get(FunctionName) as Record<string, any>;
        return {
          FunctionName,
          Timeout: config.Timeout ?? DEFAULT_LAMBDA_TIMEOUT,
          Runtime: 'nodejs22.x',
          Handler: 'index.handler',
          State: 'Active',
          Layers: [
            {
              Arn: TEST_LAYER_ARN,
            },
          ],
        };
      }
      throw new ResourceNotFoundException({ $metadata: {}, message: 'Function not found' });
    });

    mockLambdaClient.on(ListLayerVersionsCommand).resolves({
      LayerVersions: [
        {
          LayerVersionArn: TEST_LAYER_ARN,
        },
      ],
    });

    mockLambdaClient.on(UpdateFunctionConfigurationCommand).callsFake(({ FunctionName, Timeout }) => {
      const lambdaConfig = {
        FunctionName,
        Timeout,
      };

      if (lambdaMap.has(FunctionName)) {
        lambdaMap.set(FunctionName, lambdaConfig);
        return { Configuration: lambdaConfig };
      }

      throw new ResourceNotFoundException({ $metadata: {}, message: 'Function not found' });
    });

    mockLambdaClient.on(UpdateFunctionCodeCommand).callsFake(({ FunctionName }) => {
      if (lambdaMap.has(FunctionName)) {
        const lambdaConfig = lambdaMap.get(FunctionName);
        return { Configuration: lambdaConfig };
      }

      throw new ResourceNotFoundException({ $metadata: {}, message: 'Function not found' });
    });

    mockLambdaClient
      .on(ListVersionsByFunctionCommand)
      .resolves({ Versions: [{ Version: '$LATEST' }, { Version: '1' }] });
    mockLambdaClient.on(DeleteFunctionCommand).resolves({});
  });

  afterEach(() => {
    mockLambdaClient.restore();
  });

  test('Happy path', async () => {
    // Step 1: Create a bot via admin endpoint (auto-creates ProjectMembership)
    const bot = await createTestBot();
    const name = `medplum-bot-lambda-${bot.id}`;

    // Step 2: Deploy the bot
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        exports.handler = async (event) => {
          console.log('input', input);
          return input;
        }
        `,
      });
    expect(res2.status).toBe(200);

    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 2);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(CreateFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandWith(GetFunctionCommand, {
      FunctionName: name,
    });
    expect(mockLambdaClient).toHaveReceivedCommandWith(CreateFunctionCommand, {
      FunctionName: name,
    });

    // Verify that this was uploaded as a CJS zip file
    const createCall = mockLambdaClient.commandCall(0, CreateFunctionCommand);
    const createCodeBytes = createCall.args[0].input.Code?.ZipFile;
    expect(createCodeBytes).toBeInstanceOf(Uint8Array);
    const createZip = await new JSZip().loadAsync(createCodeBytes as Uint8Array);
    expect(Object.keys(createZip.files)).toEqual(expect.arrayContaining(['index.cjs', 'user.cjs']));

    mockLambdaClient.resetHistory();

    // Step 3: Deploy again to trigger the update path
    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        export async function handler() {
          console.log('input', input);
          return input;
        }
        `,
        filename: 'updated.js',
      });
    expect(res3.status).toBe(200);

    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionConfigurationCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionConfigurationCommand, 0);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionCodeCommand, 1);

    // Verify that this was uploaded as a MJS zip file
    const updateCall = mockLambdaClient.commandCall(0, UpdateFunctionCodeCommand);
    const updateCodeBytes = updateCall.args[0].input?.ZipFile;
    expect(updateCodeBytes).toBeInstanceOf(Uint8Array);
    const updateZip = await new JSZip().loadAsync(updateCodeBytes as Uint8Array);
    expect(Object.keys(updateZip.files)).toEqual(expect.arrayContaining(['index.mjs', 'user.mjs']));
  });

  test('Deploy bot with lambda layer update', async () => {
    // When deploying a bot, we check if we need to update the bot configuration.
    // This test verifies that we correctly update the bot configuration when the lambda layer changes.
    // Step 1: Create a bot via admin endpoint (auto-creates ProjectMembership)
    const bot = await createTestBot();
    const name = `medplum-bot-lambda-${bot.id}`;

    // Step 2: Deploy the bot
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
      export async function handler() {
        console.log('input', input);
        return input;
      }
      `,
      });
    expect(res2.status).toBe(200);

    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 2);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(CreateFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandWith(GetFunctionCommand, {
      FunctionName: name,
    });
    expect(mockLambdaClient).toHaveReceivedCommandWith(CreateFunctionCommand, {
      FunctionName: name,
    });
    mockLambdaClient.resetHistory();

    // Step 3: Simulate releasing a new version of the lambda layer
    mockLambdaClient.on(ListLayerVersionsCommand).resolves({
      LayerVersions: [
        {
          LayerVersionArn: 'new-layer-version-arn',
        },
      ],
    });

    // Step 4: Simulate an error when updating the code
    // On the first call to UpdateFunctionCode, return a failure
    // On the second call, return success
    mockLambdaClient
      .on(UpdateFunctionCodeCommand)
      .rejectsOnce(
        new ResourceConflictException({
          $metadata: {},
          message: 'The operation cannot be performed at this time. An update is in progress for resource',
        })
      )
      .callsFake(({ FunctionName }) => ({
        Configuration: {
          FunctionName,
        },
      }));

    // Step 5: Deploy again to trigger the update path
    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
      export async function handler() {
        console.log('input', input);
        return input;
      }
      `,
        filename: 'updated.js',
      });
    expect(res3.status).toBe(200);

    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionConfigurationCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionConfigurationCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionCodeCommand, 2);
  });

  test('Deploy bot with timeout configured', async () => {
    // Step 1: Create a bot with no timeout via admin endpoint (auto-creates ProjectMembership)
    const bot = await createTestBot();

    // Step 2: Deploy the bot without timeout ... check that default timeout was set on lambda
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
      export async function handler() {
        console.log('input', input);
        return input;
      }
      `,
      });
    expect(res2.status).toBe(200);
    expect(res2.body).toMatchObject(allOk);

    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 2);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(CreateFunctionCommand, 1);

    mockLambdaClient.resetHistory();

    // Step 3: Update bot to have to have a timeout
    const res3 = await request(app)
      .put(`/fhir/R4/Bot/${bot.id}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        ...bot,
        timeout: 15,
      });
    expect(res3.status).toBe(200);

    // Step 4: Deploy bot again
    const res4 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
      export async function handler() {
        console.log('input', input);
        return input;
      }
      `,
      });
    // expect(res4.status).toBe(200);
    expect(res4.body).toMatchObject(allOk);

    // Make sure that timeout was updated
    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionConfigurationCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionConfigurationCommand, 1);
    expect(mockLambdaClient).toHaveReceivedNthSpecificCommandWith(1, UpdateFunctionConfigurationCommand, {
      FunctionName: getLambdaNameForBot(bot),
      Role: getConfig().botLambdaRoleArn,
      Runtime: LAMBDA_RUNTIME,
      Handler: LAMBDA_HANDLER,
      Layers: [TEST_LAYER_ARN],
      Timeout: 15,
    });

    mockLambdaClient.resetHistory();

    // Step 5: Remove timeout
    // This actually tests that timeout is not overridden
    const res5 = await request(app)
      .put(`/fhir/R4/Bot/${bot.id}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        ...bot,
      });
    expect(res5.status).toBe(200);

    // Step 6: Deploy bot for final time
    const res6 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
      export async function handler() {
        console.log('input', input);
        return input;
      }
      `,
      });
    expect(res6.status).toBe(200);
    expect(res6.body).toMatchObject(allOk);

    // Make sure that timeout was updated again
    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 2);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionConfigurationCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionConfigurationCommand, 0);
  });

  test('Deploying new Bot with no timeout results in Bot with default timeout', async () => {
    const bot = await createTestBot();

    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
      export async function handler() {
        console.log('input', input);
        return input;
      }
      `,
      });
    expect(res2.status).toBe(200);
    expect(res2.body).toMatchObject(allOk);

    const res3 = await request(app)
      .get(`/fhir/R4/Bot/${bot.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body).toMatchObject({
      resourceType: 'Bot',
      name: 'Test Bot',
      runtimeVersion: 'awslambda',
      timeout: DEFAULT_LAMBDA_TIMEOUT,
    });

    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 2);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionConfigurationCommand, 0);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionConfigurationCommand, 0);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionCodeCommand, 0);
  });

  test('Deploy fails when Bot timeout is greater than max', async () => {
    const bot = await createTestBot({ timeout: 1000 });

    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        export async function handler() {
          console.log('input', input);
          return input;
        }
        `,
      });
    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject(badRequest('Bot timeout exceeds allowed maximum of 900 seconds'));
  });

  test('Cleans up old lambda versions, keeping the two newest', async () => {
    // Step 1: Create a bot via admin endpoint (auto-creates ProjectMembership)
    const bot = await createTestBot();
    const name = `medplum-bot-lambda-${bot.id}`;

    // Step 2: Initial deploy creates the lambda
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: `export async function handler() { return null; }` });
    expect(res2.status).toBe(200);

    mockLambdaClient.resetHistory();

    // Simulate paginated list with 5 published versions (plus $LATEST).
    mockLambdaClient
      .on(ListVersionsByFunctionCommand)
      .resolvesOnce({
        Versions: [{ Version: '$LATEST' }, { Version: '1' }, { Version: '2' }],
        NextMarker: 'page-2',
      })
      .resolves({
        Versions: [{ Version: '3' }, { Version: '5' }, { Version: '4' }],
      });

    // Step 3: Redeploy triggers cleanup
    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: `export async function handler() { return null; }` });
    expect(res3.status).toBe(200);

    // Cleanup runs async after the response, so poll until all expected deletes have occurred.
    // Versions 5 and 4 should be kept; 3, 2, 1 deleted.
    await waitFor(async () => {
      expect(mockLambdaClient).toHaveReceivedCommandTimes(DeleteFunctionCommand, 3);
    });
    expect(mockLambdaClient).toHaveReceivedCommandWith(DeleteFunctionCommand, { FunctionName: name, Qualifier: '3' });
    expect(mockLambdaClient).toHaveReceivedCommandWith(DeleteFunctionCommand, { FunctionName: name, Qualifier: '2' });
    expect(mockLambdaClient).toHaveReceivedCommandWith(DeleteFunctionCommand, { FunctionName: name, Qualifier: '1' });
  });

  test('Cleanup tolerates DeleteFunction errors', async () => {
    const bot = await createTestBot();

    // Initial deploy creates the lambda
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: `export async function handler() { return null; }` });
    expect(res2.status).toBe(200);

    mockLambdaClient.resetHistory();

    mockLambdaClient.on(ListVersionsByFunctionCommand).resolves({
      Versions: [{ Version: '$LATEST' }, { Version: '1' }, { Version: '2' }, { Version: '3' }],
    });
    mockLambdaClient
      .on(DeleteFunctionCommand)
      .rejects(new ResourceNotFoundException({ $metadata: {}, message: 'Function not found' }));

    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: `export async function handler() { return null; }` });
    // Deploy should still succeed even though cleanup deletion failed.
    expect(res3.status).toBe(200);
    await waitFor(async () => {
      expect(mockLambdaClient).toHaveReceivedCommandTimes(DeleteFunctionCommand, 1);
    });
  });

  test('Cleanup logs uncaught errors without failing deploy', async () => {
    const bot = await createTestBot();
    const name = `medplum-bot-lambda-${bot.id}`;

    // Initial deploy creates the lambda
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: `export async function handler() { return null; }` });
    expect(res2.status).toBe(200);

    mockLambdaClient.resetHistory();

    // Cause cleanup itself to throw (ListVersions failure is not caught inside the loop).
    mockLambdaClient
      .on(ListVersionsByFunctionCommand)
      .rejects(new TooManyRequestsException({ $metadata: {}, message: 'Too many requests' }));

    const errorSpy = jest.spyOn(globalLogger, 'error').mockReturnValue();

    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: `export async function handler() { return null; }` });
    // Deploy should still succeed even though the async cleanup throws.
    expect(res3.status).toBe(200);

    await waitFor(async () => {
      expect(errorSpy).toHaveBeenCalledWith(
        'Error occurred while deleting old Lambdas',
        expect.objectContaining({ name, err: expect.stringContaining('Too many requests') })
      );
    });

    errorSpy.mockRestore();
  });

  test('Exists check throws error', async () => {
    mockLambdaClient.on(GetFunctionCommand).callsFakeOnce(() => {
      throw new TooManyRequestsException({ message: 'Too many requests', $metadata: {} });
    });

    const bot = await createTestBot({ timeout: 100 });

    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        export async function handler() {
          console.log('input', input);
          return input;
        }
        `,
      });
    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject(badRequest('Too many requests'));
  });
});

describe('getLambdaTimeoutForBot', () => {
  const app = express();
  let mockLambdaClient: AwsClientStub<LambdaClient>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    mockLambdaClient = mockClient(LambdaClient);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  afterEach(() => {
    mockLambdaClient.restore();
  });

  test('Throws when any exception except for `ResourceNotFoundException` is thrown', async () => {
    mockLambdaClient.on(GetFunctionCommand).callsFake(() => {
      throw new TooManyRequestsException({ message: 'Too many requests', $metadata: {} });
    });

    await expect(getLambdaTimeoutForBot({ id: randomUUID(), resourceType: 'Bot', name: 'Test Bot' })).rejects.toThrow(
      new TooManyRequestsException({ message: 'Too many requests', $metadata: {} })
    );
  });
});
