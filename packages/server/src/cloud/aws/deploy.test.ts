import {
  CreateFunctionCommand,
  CreateFunctionRequest,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  LambdaClient,
  ListLayerVersionsCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { ContentType } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;
let mockLambdaClient: AwsClientStub<LambdaClient>;

describe('Deploy', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    let created = false;

    mockLambdaClient = mockClient(LambdaClient);

    mockLambdaClient.on(CreateFunctionCommand).callsFake(({ FunctionName }) => {
      created = true;

      return {
        Configuration: {
          FunctionName,
        },
      };
    });

    mockLambdaClient.on(GetFunctionCommand).callsFake(({ FunctionName }) => {
      if (created) {
        return {
          Configuration: {
            FunctionName,
          },
        };
      }

      return {
        Configuration: {},
      };
    });

    mockLambdaClient.on(GetFunctionConfigurationCommand).callsFake(({ FunctionName }) => {
      return {
        FunctionName,
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        State: 'Active',
        Layers: [
          {
            Arn: 'arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1',
          },
        ],
      };
    });

    mockLambdaClient.on(ListLayerVersionsCommand).resolves({
      LayerVersions: [
        {
          LayerVersionArn: 'arn:aws:lambda:us-east-1:123456789012:layer:test-layer:1',
        },
      ],
    });

    mockLambdaClient.on(UpdateFunctionCodeCommand).callsFake(({ FunctionName }) => ({
      Configuration: {
        FunctionName,
      },
    }));
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
        export async function handler() {
          console.log('input', input);
          return input;
        }
        `,
      });
    expect(res2.status).toBe(200);

    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(CreateFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandWith(GetFunctionCommand, {
      FunctionName: name,
    });
    expect(mockLambdaClient).toHaveReceivedCommandWith(CreateFunctionCommand, {
      FunctionName: name,
    } as CreateFunctionRequest);
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
    expect(mockLambdaClient).toHaveReceivedCommandWith(GetFunctionCommand, {
      FunctionName: name,
    });
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

    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(CreateFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandWith(GetFunctionCommand, {
      FunctionName: name,
    });
    expect(mockLambdaClient).toHaveReceivedCommandWith(CreateFunctionCommand, {
      FunctionName: name,
    } as CreateFunctionRequest);
    mockLambdaClient.resetHistory();

    // Step 3: Simulate releasing a new version of the lambda layer
    mockLambdaClient.on(ListLayerVersionsCommand).resolves({
      LayerVersions: [
        {
          LayerVersionArn: 'new-layer-version-arn',
        },
      ],
    });

    // Step 4: Deploy again to trigger the update path
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
    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionConfigurationCommand, 2);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionConfigurationCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionCodeCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandWith(GetFunctionCommand, {
      FunctionName: name,
    });
  });
});
