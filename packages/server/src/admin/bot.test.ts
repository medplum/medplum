import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { withTestContext } from '../test.setup';

const app = express();

describe('Bot admin', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    return withTestContext(() => initApp(app, config));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Create new bot', async () => {
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
    expect(res2.body.code).toBeUndefined();
    expect(res2.body.sourceCode).toBeDefined();

    // Read the bot
    const res3 = await request(app)
      .get('/fhir/R4/Bot/' + res2.body.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.resourceType).toBe('Bot');
    expect(res3.body.id).toBe(res2.body.id);

    // Create bot with invalid name (should fail)
    const res4 = await request(app)
      .post('/admin/projects/' + project.id + '/bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({ foo: 'bar' });
    expect(res4.status).toBe(400);
  });
});
