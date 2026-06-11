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
import { randomUUID } from 'crypto';
import express from 'express';
import JSZip from 'jszip';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import { globalLogger } from '../../logger';
import { initTestAuth, waitFor } from '../../test.setup';
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
  let mockLambdaClient: AwsClientStub<LambdaClient>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
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

    expect(mockLambdaClient.commandCalls(GetFunctionCommand)).toHaveLength(2);
    expect(mockLambdaClient.commandCalls(ListLayerVersionsCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(CreateFunctionCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(GetFunctionCommand, {
      FunctionName: name,
    })).toHaveLength(2);
    expect(mockLambdaClient.commandCalls(CreateFunctionCommand, {
      FunctionName: name,
    })).toHaveLength(1);

    // Verify that this was uploaded as a CJS zip file
    const createCall = mockLambdaClient.commandCalls(CreateFunctionCommand)[0];
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

    expect(mockLambdaClient.commandCalls(GetFunctionCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(ListLayerVersionsCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(GetFunctionConfigurationCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(UpdateFunctionConfigurationCommand)).toHaveLength(0);
    expect(mockLambdaClient.commandCalls(UpdateFunctionCodeCommand)).toHaveLength(1);

    // Verify that this was uploaded as a MJS zip file
    const updateCall = mockLambdaClient.commandCalls(UpdateFunctionCodeCommand)[0];
    const updateCodeBytes = updateCall.args[0].input?.ZipFile;
    expect(updateCodeBytes).toBeInstanceOf(Uint8Array);
    const updateZip = await new JSZip().loadAsync(updateCodeBytes as Uint8Array);
    expect(Object.keys(updateZip.files)).toEqual(expect.arrayContaining(['index.mjs', 'user.mjs']));
  });

  test('Deploy bot with lambda layer update', async () => {
    // When deploying a bot, we check if we need to update the bot configuration.
    // This test verifies that we correctly update the bot configuration when the lambda layer changes.
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

    expect(mockLambdaClient.commandCalls(GetFunctionCommand)).toHaveLength(2);
    expect(mockLambdaClient.commandCalls(ListLayerVersionsCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(CreateFunctionCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(GetFunctionCommand, {
      FunctionName: name,
    })).toHaveLength(2);
    expect(mockLambdaClient.commandCalls(CreateFunctionCommand, {
      FunctionName: name,
    })).toHaveLength(1);
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

    expect(mockLambdaClient.commandCalls(GetFunctionCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(ListLayerVersionsCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(GetFunctionConfigurationCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(UpdateFunctionConfigurationCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(UpdateFunctionCodeCommand)).toHaveLength(2);
  });

  test('Deploy bot with timeout configured', async () => {
    // Step 1: Create a bot with no timeout
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

    expect(mockLambdaClient.commandCalls(GetFunctionCommand)).toHaveLength(2);
    expect(mockLambdaClient.commandCalls(ListLayerVersionsCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(CreateFunctionCommand)).toHaveLength(1);

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
    expect(mockLambdaClient.commandCalls(GetFunctionCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(ListLayerVersionsCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(GetFunctionConfigurationCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(UpdateFunctionConfigurationCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(UpdateFunctionConfigurationCommand, {
      FunctionName: getLambdaNameForBot(bot),
      Role: getConfig().botLambdaRoleArn,
      Runtime: LAMBDA_RUNTIME,
      Handler: LAMBDA_HANDLER,
      Layers: [TEST_LAYER_ARN],
      Timeout: 15,
    })[1 - 1]).toBeDefined();
    expect(mockLambdaClient.commandCalls(UpdateFunctionConfigurationCommand)[1 - 1].args[0].input).toEqual(expect.objectContaining({
      FunctionName: getLambdaNameForBot(bot),
      Role: getConfig().botLambdaRoleArn,
      Runtime: LAMBDA_RUNTIME,
      Handler: LAMBDA_HANDLER,
      Layers: [TEST_LAYER_ARN],
      Timeout: 15,
    }));

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
    expect(mockLambdaClient.commandCalls(GetFunctionCommand)).toHaveLength(2);
    expect(mockLambdaClient.commandCalls(ListLayerVersionsCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(GetFunctionConfigurationCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(UpdateFunctionConfigurationCommand)).toHaveLength(0);
  });

  test('Deploying new Bot with no timeout results in Bot with default timeout', async () => {
    const botProps = {
      resourceType: 'Bot',
      name: 'Test Bot',
      runtimeVersion: 'awslambda',
      code: `
    export async function handler() {
      console.log('input', input);
      return input;
    }
    `,
    };
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        ...botProps,
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as Bot;

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
    expect(res3.body).toMatchObject({ ...botProps, timeout: DEFAULT_LAMBDA_TIMEOUT });

    expect(mockLambdaClient.commandCalls(GetFunctionCommand)).toHaveLength(2);
    expect(mockLambdaClient.commandCalls(ListLayerVersionsCommand)).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(GetFunctionConfigurationCommand)).toHaveLength(0);
    expect(mockLambdaClient.commandCalls(UpdateFunctionConfigurationCommand)).toHaveLength(0);
    expect(mockLambdaClient.commandCalls(UpdateFunctionCodeCommand)).toHaveLength(0);
  });

  test('Deploy fails when Bot timeout is greater than max', async () => {
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
        timeout: 1000,
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as Bot;

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
    // Step 1: Create a bot
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'awslambda',
        code: `export async function handler() { return null; }`,
      });
    expect(res1.status).toBe(201);
    const bot = res1.body as Bot;
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
      expect(mockLambdaClient.commandCalls(DeleteFunctionCommand)).toHaveLength(3);
    });
    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand, { FunctionName: name, Qualifier: '3' })).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand, { FunctionName: name, Qualifier: '2' })).toHaveLength(1);
    expect(mockLambdaClient.commandCalls(DeleteFunctionCommand, { FunctionName: name, Qualifier: '1' })).toHaveLength(1);
  });

  test('Cleanup tolerates DeleteFunction errors', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'awslambda',
        code: `export async function handler() { return null; }`,
      });
    expect(res1.status).toBe(201);
    const bot = res1.body as Bot;

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
      expect(mockLambdaClient.commandCalls(DeleteFunctionCommand)).toHaveLength(1);
    });
  });

  test('Cleanup logs uncaught errors without failing deploy', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Bot',
        runtimeVersion: 'awslambda',
        code: `export async function handler() { return null; }`,
      });
    expect(res1.status).toBe(201);
    const bot = res1.body as Bot;
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

    const errorSpy = vi.spyOn(globalLogger, 'error').mockReturnValue();

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
        timeout: 100,
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as Bot;

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
