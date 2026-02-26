// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CreateFunctionRequest } from '@aws-sdk/client-lambda';
import {
  CreateFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  LambdaClient,
  ListLayerVersionsCommand,
  ResourceNotFoundException,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { ContentType } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import express from 'express';
import JSZip from 'jszip';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';
import { DEFAULT_LAMBDA_TIMEOUT } from './deploy';

const TEST_LAYER_ARN = 'arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1';

describe('Deploy Streaming', () => {
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
  });

  afterEach(() => {
    mockLambdaClient.restore();
  });

  test('Happy path', async () => {
    // Step 1: Create a streaming bot
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Streaming Bot',
        runtimeVersion: 'awslambda',
        streamingEnabled: true,
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

    // Step 2: Deploy the bot with CJS code
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
    } as CreateFunctionRequest);

    // Verify that this was uploaded as a CJS zip file with streaming wrapper
    const createCall = mockLambdaClient.commandCall(0, CreateFunctionCommand);
    const createCodeBytes = createCall.args[0].input.Code?.ZipFile;
    expect(createCodeBytes).toBeInstanceOf(Uint8Array);
    const createZip = await new JSZip().loadAsync(createCodeBytes as Uint8Array);
    expect(Object.keys(createZip.files)).toEqual(expect.arrayContaining(['index.cjs', 'user.cjs']));

    // Verify streaming wrapper code is present
    const cjsFile = createZip.file('index.cjs');
    expect(cjsFile).toBeDefined();
    const indexContent = await cjsFile?.async('string');
    expect(indexContent).toContain('streamifyResponse');
    expect(indexContent).toContain('BotResponseStream');
    expect(indexContent).toContain('startStreaming');
    expect(indexContent).toContain('writeResponse');

    mockLambdaClient.resetHistory();

    // Step 3: Deploy again with ESM code to trigger the update path
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

    // Verify that this was uploaded as a MJS zip file with streaming wrapper
    const updateCall = mockLambdaClient.commandCall(0, UpdateFunctionCodeCommand);
    const updateCodeBytes = updateCall.args[0].input?.ZipFile;
    expect(updateCodeBytes).toBeInstanceOf(Uint8Array);
    const updateZip = await new JSZip().loadAsync(updateCodeBytes as Uint8Array);
    expect(Object.keys(updateZip.files)).toEqual(expect.arrayContaining(['index.mjs', 'user.mjs']));

    // Verify ESM streaming wrapper
    const esmFile = updateZip.file('index.mjs');
    expect(esmFile).toBeDefined();
    const esmIndexContent = await esmFile?.async('string');
    expect(esmIndexContent).toContain('streamifyResponse');
    expect(esmIndexContent).toContain('BotResponseStream');
  });

  test('Zip contains streaming-specific wrapper code', async () => {
    // Step 1: Create a streaming bot
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Streaming Bot',
        runtimeVersion: 'awslambda',
        streamingEnabled: true,
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as Bot;

    // Step 2: Deploy with code
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        exports.handler = async (event) => {
          return 'hello';
        }
        `,
      });
    expect(res2.status).toBe(200);

    // Verify the zip contents contain streaming-specific code
    const createCall = mockLambdaClient.commandCall(0, CreateFunctionCommand);
    const codeBytes = createCall.args[0].input.Code?.ZipFile;
    expect(codeBytes).toBeInstanceOf(Uint8Array);
    const zip = await new JSZip().loadAsync(codeBytes as Uint8Array);

    const cjsFile = zip.file('index.cjs');
    expect(cjsFile).toBeDefined();
    const indexContent = await cjsFile?.async('string');

    // Streaming-specific: uses streamifyResponse
    expect(indexContent).toContain('awslambda.streamifyResponse');

    // Streaming-specific: BotResponseStream class
    expect(indexContent).toContain('class BotResponseStream');
    expect(indexContent).toContain('startStreaming');
    expect(indexContent).toContain('streamStarted');

    // Streaming-specific: writeResponse helper
    expect(indexContent).toContain('writeResponse');

    // Contains createPdf function
    expect(indexContent).toContain('createPdf');
    expect(indexContent).toContain('PdfPrinter');

    // User code is in separate file
    const userFile = zip.file('user.cjs');
    expect(userFile).toBeDefined();
    const userContent = await userFile?.async('string');
    expect(userContent).toContain('exports.handler');
  });

  test('Non-streaming bot does not use streaming deploy', async () => {
    // Create a non-streaming bot
    const res1 = await request(app)
      .post(`/fhir/R4/Bot`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Test Non-Streaming Bot',
        runtimeVersion: 'awslambda',
        streamingEnabled: false,
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as Bot;

    // Deploy with code
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        exports.handler = async (event) => {
          return 'hello';
        }
        `,
      });
    expect(res2.status).toBe(200);

    // Verify the zip does NOT contain streaming code
    const createCall = mockLambdaClient.commandCall(0, CreateFunctionCommand);
    const codeBytes = createCall.args[0].input.Code?.ZipFile;
    expect(codeBytes).toBeInstanceOf(Uint8Array);
    const zip = await new JSZip().loadAsync(codeBytes as Uint8Array);

    const cjsFile = zip.file('index.cjs');
    expect(cjsFile).toBeDefined();
    const indexContent = await cjsFile?.async('string');

    // Non-streaming: should NOT use streamifyResponse
    expect(indexContent).not.toContain('streamifyResponse');
    expect(indexContent).not.toContain('BotResponseStream');
  });
});
