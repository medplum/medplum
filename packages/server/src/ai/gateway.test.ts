// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
  ThrottlingException,
} from '@aws-sdk/client-bedrock-runtime';
import type { AwsClientStub } from 'aws-sdk-client-mock';
import { mockClient } from 'aws-sdk-client-mock';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { addTestUser, createTestProject, withTestContext } from '../test.setup';

const MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';

const message = {
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: 'Hello' }],
  usage: { input_tokens: 10, output_tokens: 2 },
};

const streamEvents = [
  { type: 'message_start', message: { ...message, content: [], usage: { input_tokens: 10, output_tokens: 1 } } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
  { type: 'message_stop' },
];

describe('AI gateway', () => {
  const app = express();
  let accessToken: string;
  let bedrock: AwsClientStub<BedrockRuntimeClient>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ accessToken } = await createTestProject({ withAccessToken: true, project: { features: ['ai-gateway'] } }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    bedrock = mockClient(BedrockRuntimeClient);
  });

  afterEach(() => {
    bedrock.restore();
  });

  test('Passes a Messages request through to Bedrock', async () => {
    bedrock.on(InvokeModelCommand).resolves({
      body: { transformToString: () => JSON.stringify(message) } as any,
      contentType: 'application/json',
    });

    const res = await request(app)
      .post('/ai/anthropic/v1/messages')
      .set('x-api-key', accessToken)
      .set('anthropic-version', '2023-06-01')
      .set('anthropic-beta', 'context-1m-2025-08-07, interleaved-thinking-2025-05-14')
      .send({ model: MODEL_ID, max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual(message);

    const input = bedrock.commandCalls(InvokeModelCommand)[0].args[0].input;
    expect(input.modelId).toBe(MODEL_ID);
    expect(JSON.parse(input.body as string)).toStrictEqual({
      anthropic_version: 'bedrock-2023-05-31',
      anthropic_beta: ['context-1m-2025-08-07', 'interleaved-thinking-2025-05-14'],
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  test('Re-encodes the Bedrock stream as server-sent events', async () => {
    const encoder = new TextEncoder();
    bedrock.on(InvokeModelWithResponseStreamCommand).resolves({
      body: (async function* () {
        for (const event of streamEvents) {
          yield { chunk: { bytes: encoder.encode(JSON.stringify(event)) } };
        }
      })() as any,
      contentType: 'application/json',
    });

    const res = await request(app)
      .post('/ai/anthropic/v1/messages')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ model: MODEL_ID, max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toBe(streamEvents.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
    const input = bedrock.commandCalls(InvokeModelWithResponseStreamCommand)[0].args[0].input;
    expect(JSON.parse(input.body as string).stream).toBeUndefined();
  });

  test('Returns Bedrock errors in the Anthropic error shape', async () => {
    bedrock
      .on(InvokeModelCommand)
      .rejects(new ThrottlingException({ message: 'Too many requests', $metadata: { httpStatusCode: 429 } }));

    const res = await request(app)
      .post('/ai/anthropic/v1/messages')
      .set('x-api-key', accessToken)
      .send({ model: MODEL_ID, max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(429);
    expect(res.body).toStrictEqual({
      type: 'error',
      error: { type: 'rate_limit_error', message: 'Too many requests' },
    });
  });

  test('Passes Anthropic Bedrock model IDs through', async () => {
    bedrock.on(InvokeModelCommand).resolves({
      body: { transformToString: () => JSON.stringify(message) } as any,
      contentType: 'application/json',
    });
    const modelId = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

    const res = await request(app)
      .post('/ai/anthropic/v1/messages')
      .set('x-api-key', accessToken)
      .send({ model: modelId, max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(200);
    expect(bedrock.commandCalls(InvokeModelCommand)[0].args[0].input.modelId).toBe(modelId);
  });

  test.each(['claude-opus-4-1', 'meta.llama3-70b-instruct-v1:0', 'us.anthropic.claude-x/../other'])(
    'Rejects unavailable model %s',
    async (model) => {
      const res = await request(app)
        .post('/ai/anthropic/v1/messages')
        .set('x-api-key', accessToken)
        .send({ model, max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });

      expect(res.status).toBe(400);
      expect(res.body.error.type).toBe('invalid_request_error');
      expect(bedrock.calls()).toHaveLength(0);
    }
  );

  test('Requires authentication', async () => {
    const res = await request(app)
      .post('/ai/anthropic/v1/messages')
      .send({ model: MODEL_ID, max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });

    expect(res.status).toBe(401);
  });

  test('Supported account types', async () => {
    bedrock.on(InvokeModelCommand).resolves({
      body: { transformToString: () => JSON.stringify(message) } as any,
      contentType: 'application/json',
    });
    const { project } = await createTestProject({ project: { features: ['ai-gateway'] } });
    const noAi = await createTestProject({ withAccessToken: true, project: { features: ['ai'] } });
    const [patient, smartApp, practitioner] = await withTestContext(async () => [
      await addTestUser(project, { resourceType: 'Patient' }),
      await addTestUser(project, { scope: 'openid user/Observation.rs' }),
      await addTestUser(project),
    ]);

    const callAi = (token: string): Promise<request.Response> =>
      request(app)
        .post('/ai/anthropic/v1/messages')
        .set('x-api-key', token)
        .send({ model: MODEL_ID, max_tokens: 100, messages: [{ role: 'user', content: 'Hi' }] });

    expect((await callAi(practitioner.accessToken)).status).toBe(200);
    expect((await callAi(patient.accessToken)).status).toBe(403);
    expect((await callAi(smartApp.accessToken)).status).toBe(403);
    expect((await callAi(noAi.accessToken)).status).toBe(403);
  });
});
