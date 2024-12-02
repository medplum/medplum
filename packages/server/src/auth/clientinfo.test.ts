import express from 'express';
import { ClientApplication } from '@medplum/fhirtypes';
import { initApp, initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { createTestClient } from '../test.setup';
import request from 'supertest';

const app = express();
let client: ClientApplication;

describe('OAuth utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    client = await createTestClient();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success with SignInForm', async () => {
    const res = await request(app).get(`/auth/clientinfo/${client.id}`).type('json');
    expect(res.status).toBe(200);
    expect(res.body.welcomeString).toBe(client.signInForm?.welcomeString);
    expect(res.body.logo.url).toBe(client.signInForm?.logo?.url);
  });

  test('Invalid client', async () => {
    const res = await request(app).get(`/auth/clientinfo/INVALIDID`).type('json');
    expect(res.status).toBe(404);
  });
});
