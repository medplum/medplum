import {
  CreateFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  LambdaClient,
  ListLayerVersionsCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { Bot } from '@medplum/fhirtypes';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { randomUUID } from 'crypto';
import express from 'express';
import { mkdtempSync, rmSync } from 'fs';
import { sep } from 'path';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
const binaryDir = mkdtempSync(__dirname + sep + 'binary-');
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
    rmSync(binaryDir, { recursive: true, force: true });
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
        Runtime: 'node16.x',
        Handler: 'index.handler',
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
          LayerVersionArn: 'xyz',
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
      .set('Content-Type', 'application/fhir+json')
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
      .set('Content-Type', 'application/fhir+json')
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
    });
    mockLambdaClient.resetHistory();

    // Step 3: Update the bot
    const res3 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', 'application/fhir+json')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
        export async function handler() {
          console.log('input', input);
          return input;
        }
        `,
      });
    expect(res3.status).toBe(200);

    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(ListLayerVersionsCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(GetFunctionConfigurationCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionConfigurationCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandTimes(UpdateFunctionCodeCommand, 1);
    expect(mockLambdaClient).toHaveReceivedCommandWith(GetFunctionCommand, {
      FunctionName: name,
    });
  });

  test('Bots not enabled', async () => {
    // First, Alice creates a project
    const { project, accessToken } = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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
      .set('Content-Type', 'application/json')
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
    expect(res3.body.issue[0].details.text).toEqual('Bots not enabled');
  });
});
