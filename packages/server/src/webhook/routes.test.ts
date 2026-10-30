// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, ContentType, createReference } from '@medplum/core';
import type { AccessPolicy, Bot, Project, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject } from '../test.setup';

const cjsCode = `
exports.handler = async function (medplum, event) {
  console.log(JSON.stringify(event));
  return event.headers["x-test-return-event"] ? { input: event.input } : event.input;
};
`;

const binaryResponseCode = `
exports.handler = async function (medplum, event) {
  // Use a simple base64-encoded string
  return {
    resourceType: 'Binary',
    contentType: 'text/xml',
    data: 'PFJlc3BvbnNlPjxTYXk+SGVsbG8sIHdvcmxkITwvU2F5PjwvUmVzcG9uc2U+'// Base64 encoding of <Response><Say>Hello, world!</Say></Response>
  };
};
`;

describe('Anonymous webhooks', () => {
  let app: express.Express;
  let project: WithId<Project>;
  let accessPolicy: WithId<AccessPolicy>;
  let adminMembership: WithId<ProjectMembership>;
  let accessToken: string;
  let bot: WithId<Bot>;
  let botMembership: WithId<ProjectMembership>;
  let rawBodyBotMembership: WithId<ProjectMembership>;
  let binaryResponseBotMembership: WithId<ProjectMembership>;

  beforeAll(async () => {
    app = express();
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    await initApp(app, config);

    const testSetup = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
      accessPolicy: {
        resource: [{ resourceType: '*' }],
      },
    });
    project = testSetup.project;
    accessPolicy = testSetup.accessPolicy;
    adminMembership = testSetup.membership;
    accessToken = testSetup.accessToken;

    [bot, botMembership] = await createWebhookBot('Alice personal bot', cjsCode);
    [, rawBodyBotMembership] = await createWebhookBot('Raw body bot', cjsCode, { rawBody: true });
    [, binaryResponseBotMembership] = await createWebhookBot('Binary response bot', binaryResponseCode);
  });

  async function createWebhookBot(
    name: string,
    code: string,
    settings?: Partial<Bot>
  ): Promise<[WithId<Bot>, WithId<ProjectMembership>]> {
    const res1 = await request(app)
      .post('/admin/projects/' + project.id + '/bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({ name, description: `${name} description`, accessPolicy: createReference(accessPolicy) });
    expect(res1).toHaveStatus(201);
    const newBot = res1.body as WithId<Bot>;

    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${newBot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code });
    expect(res2).toHaveStatus(200);

    const res3 = await request(app)
      .patch(`/fhir/R4/Bot/${newBot.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON_PATCH)
      .send(
        Object.entries({ publicWebhook: true, ...settings }).map(([key, value]) => ({
          op: 'add',
          path: '/' + key,
          value,
        }))
      );
    expect(res3).toHaveStatus(200);

    const res4 = await request(app)
      .get(`/fhir/R4/ProjectMembership?profile=Bot/${newBot.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4).toHaveStatus(200);
    expect(res4.body.entry).toHaveLength(1);
    return [newBot, res4.body.entry[0].resource as WithId<ProjectMembership>];
  }

  afterAll(async () => {
    await shutdownApp();
  });

  test.each(['/webhook/', '/api/webhook/', '/projects/{projectId}/webhook/', '/api/projects/{projectId}/webhook/'])(
    'Preserves parsed JSON by default through VM execution at %s',
    async (prefix) => {
      const rawBody = '{ "greeting" : "café 🌍", "escaped": "\\u0061" }\n';
      const res = await request(app)
        .post(prefix.replace('{projectId}', project.id) + botMembership.id)
        .set('Content-Type', ContentType.JSON)
        .set('x-test-return-event', 'true')
        .send(rawBody);
      expect(res).toHaveStatus(200);
      expect(res.body).toEqual({ input: JSON.parse(rawBody) });
    }
  );

  test('Bot.rawBody selects raw or parsed JSON input', async () => {
    const rawBody = '{ "value": 1.00 }\n';
    for (const [membership, input] of [
      [botMembership, { value: 1 }],
      [rawBodyBotMembership, rawBody],
    ] as const) {
      const res = await request(app)
        .post(`/webhook/${membership.id}`)
        .set('Content-Type', ContentType.JSON)
        .set('x-test-return-event', 'true')
        .send(rawBody);
      expect(res).toHaveStatus(200);
      expect(res.body).toEqual({ input });
    }
  });

  test('Does not capture raw body for non-JSON webhooks', async () => {
    const res = await request(app)
      .post(`/webhook/${botMembership.id}`)
      .set('Content-Type', ContentType.TEXT)
      .set('x-test-return-event', 'true')
      .send('hello');
    expect(res).toHaveStatus(200);
    expect(res.type).toBe(ContentType.TEXT);
    expect(JSON.parse(res.text)).toEqual({ input: 'hello' });
  });

  test('Falls back to parsed body when rawBody is enabled but content type is not JSON', async () => {
    const res = await request(app)
      .post(`/webhook/${rawBodyBotMembership.id}`)
      .set('Content-Type', ContentType.FORM_URL_ENCODED)
      .set('x-test-return-event', 'true')
      .send('value=1.00');
    expect(res).toHaveStatus(200);
    expect(JSON.parse(res.text)).toEqual({ input: { value: '1.00' } });
  });

  test('Authenticated execute parses the body by default (rawBody not set)', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$execute`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .set('x-test-return-event', 'true')
      .send('{ "greeting" : "hello" }');
    expect(res).toHaveStatus(200);
    expect(res.body).toEqual({ input: { greeting: 'hello' } });
  });

  test('Missing invalid ID', async () => {
    const res = await request(app)
      .post(`/webhook/${randomUUID()}`)
      .set('Content-Type', ContentType.TEXT)
      .set('x-signature', 'signature')
      .send('input');
    expect(res).toHaveStatus(404);
  });

  test('Non-bot project membership', async () => {
    const res = await request(app)
      .post(`/webhook/${adminMembership.id}`)
      .set('Content-Type', ContentType.TEXT)
      .set('x-signature', 'signature')
      .send('input');
    expect(res).toHaveStatus(403);
    expect(res.text).toStrictEqual('ProjectMembership must be for a Bot resource');
  });

  test('Success with default result', async () => {
    const res = await request(app)
      .post(`/webhook/${botMembership.id}`)
      .set('Content-Type', ContentType.TEXT)
      .set('x-signature', 'signature')
      .send('input');
    expect(res).toHaveStatus(200);
  });

  test('Success with OperationOutcome', async () => {
    const res = await request(app)
      .post(`/webhook/${botMembership.id}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('x-signature', 'signature')
      .send(allOk);
    expect(res).toHaveStatus(200);
  });

  test('Response contains a body', async () => {
    const input = { test: 'response' };
    const res = await request(app)
      .post(`/webhook/${botMembership.id}`)
      .set('Content-Type', ContentType.JSON)
      .set('x-signature', 'signature')
      .send(JSON.stringify(input));
    expect(res.body).toEqual(input);
    expect(res.header['content-type']).toContain('application/json');
  });

  test('Response as as a binary with content type text/xml', async () => {
    const input = { test: 'response' };
    const res = await request(app)
      .post(`/webhook/${binaryResponseBotMembership.id}`)
      .set('Content-Type', ContentType.JSON)
      .set('x-signature', 'signature')
      .send(input);
    expect(res).toHaveStatus(200);
    expect(res.header['content-type']).toContain('text/xml');
    expect(res.text.trim()).toBe('<Response><Say>Hello, world!</Say></Response>');
  });

  test('Bot without publicWebhook flag', async () => {
    const res1 = await request(app)
      .post('/admin/projects/' + project.id + '/bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
        accessPolicy: createReference(accessPolicy),
      });
    expect(res1).toHaveStatus(201);
    expect(res1.body.resourceType).toBe('Bot');
    expect(res1.body.id).toBeDefined();

    const botWithoutPublicWebhook = res1.body as WithId<Bot>;

    const res2 = await request(app)
      .get(`/fhir/R4/ProjectMembership?profile=Bot/${botWithoutPublicWebhook.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    expect(res2.body.entry).toBeDefined();
    expect(res2.body.entry.length).toBe(1);

    const projectMembership = res2.body.entry[0].resource as WithId<ProjectMembership>;

    const res3 = await request(app)
      .post(`/webhook/${projectMembership.id}`)
      .set('Content-Type', ContentType.TEXT)
      .set('x-signature', 'signature')
      .send('input');
    expect(res3).toHaveStatus(403);
    expect(res3.text).toStrictEqual('Bot is not configured for public webhook access');
  });

  test('Bot without access policy', async () => {
    const res1 = await request(app)
      .post('/admin/projects/' + project.id + '/bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
      });
    expect(res1).toHaveStatus(201);
    expect(res1.body.resourceType).toBe('Bot');
    expect(res1.body.id).toBeDefined();

    const botWithoutPublicWebhook = res1.body as WithId<Bot>;

    const res2 = await request(app)
      .get(`/fhir/R4/ProjectMembership?profile=Bot/${botWithoutPublicWebhook.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    expect(res2.body.entry).toBeDefined();
    expect(res2.body.entry.length).toBe(1);

    const projectMembership = res2.body.entry[0].resource as WithId<ProjectMembership>;

    const res3 = await request(app)
      .patch(`/fhir/R4/Bot/${botWithoutPublicWebhook.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON_PATCH)
      .send([
        {
          op: 'add',
          path: '/publicWebhook',
          value: true,
        },
      ]);
    expect(res3).toHaveStatus(200);

    const res4 = await request(app)
      .post(`/webhook/${projectMembership.id}`)
      .set('Content-Type', ContentType.TEXT)
      .set('x-signature', 'signature')
      .send('input');
    expect(res4).toHaveStatus(403);
    expect(res4.text).toStrictEqual('ProjectMembership must have an Access Policy');
  });
});
