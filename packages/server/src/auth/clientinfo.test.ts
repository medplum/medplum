// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ClientApplication } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestClient } from '../test.setup';

const app = express();
let client: ClientApplication;

describe('OAuth utils', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    client = await createTestClient();
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
