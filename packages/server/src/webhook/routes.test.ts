import { allOk, ContentType, WithId } from '@medplum/core';
import { Bot, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject } from '../test.setup';

const cjsCode = `
exports.handler = async function (medplum, event) {
  console.log(JSON.stringify(event));
  return event.input;
};
`;

describe('Anonymous webhooks', () => {
  let app: express.Express;
  let adminMembership: WithId<ProjectMembership>;
  let accessToken: string;
  let bot: WithId<Bot>;
  let botMembership: WithId<ProjectMembership>;

  beforeAll(async () => {
    app = express();
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    await initApp(app, config);

    const testSetup = await createTestProject({
      withAccessToken: true,
      withClient: true,
      membership: { admin: true },
    });
    adminMembership = testSetup.membership;
    accessToken = testSetup.accessToken;

    // Create the bot
    const res1 = await request(app)
      .post('/admin/projects/' + testSetup.project.id + '/bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        name: 'Alice personal bot',
        description: 'Alice bot description',
      });
    expect(res1.status).toBe(201);
    expect(res1.body.resourceType).toBe('Bot');
    expect(res1.body.id).toBeDefined();
    bot = res1.body as WithId<Bot>;

    // Deploy the bot
    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: cjsCode,
      });
    expect(res2.status).toBe(200);

    // Get the bot ProjectMembership
    const res3 = await request(app)
      .get(`/fhir/R4/ProjectMembership?profile=Bot/${bot.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.entry).toBeDefined();
    expect(res3.body.entry.length).toBe(1);
    botMembership = res3.body.entry[0].resource as WithId<ProjectMembership>;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing signature header', async () => {
    const res = await request(app)
      .post(`/webhook/${botMembership.id}`)
      .set('Content-Type', ContentType.TEXT)
      .send('input');
    expect(res.status).toBe(400);
    expect(res.text).toStrictEqual('Missing required signature header');
  });

  test('Missing invalid ID', async () => {
    const res = await request(app)
      .post(`/webhook/${randomUUID()}`)
      .set('Content-Type', ContentType.TEXT)
      .set('x-signature', 'signature')
      .send('input');
    expect(res.status).toBe(404);
  });

  test('Non-bot project membership', async () => {
    const res = await request(app)
      .post(`/webhook/${adminMembership.id}`)
      .set('Content-Type', ContentType.TEXT)
      .set('x-signature', 'signature')
      .send('input');
    expect(res.status).toBe(400);
    expect(res.text).toStrictEqual('ProjectMembership must be for a Bot resource');
  });

  test('Success with default result', async () => {
    const res = await request(app)
      .post(`/webhook/${botMembership.id}`)
      .set('Content-Type', ContentType.TEXT)
      .set('x-signature', 'signature')
      .send('input');
    expect(res.status).toBe(200);
  });

  test('Success with OperationOutcome', async () => {
    const res = await request(app)
      .post(`/webhook/${botMembership.id}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('x-signature', 'signature')
      .send(allOk);
    expect(res.status).toBe(200);
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
});
