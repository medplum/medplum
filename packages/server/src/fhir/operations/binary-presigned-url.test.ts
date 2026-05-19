// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Binary, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { MedplumServerConfig } from '../../config/types';
import { createTestProject, initTestAuth } from '../../test.setup';

const app = express();

describe('Binary/$presigned-url', () => {
  let accessToken: string;
  let config: MedplumServerConfig;
  let server: Server;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);

    // Manually bind the server to a port so it uses a consistent one for all requests
    server = app.listen();
  });

  beforeEach(async () => {
    accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();
  });

  afterAll(async () => {
    await shutdownApp();

    // Manually close server so test can exit
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  test('Full write-read cycle', async () => {
    // Use same instance to ensure the same server hostname between multiple requests
    const testAgent = request(server);

    // Set the storage base URL to the same mock server base URL
    const baseUrl = testAgent.get('/').url;
    config.storageBaseUrl = baseUrl + 'storage/';

    const binRes = await testAgent
      .post('/fhir/R4/Binary')
      .auth(accessToken, { type: 'bearer' })
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Binary',
        contentType: 'text/plain',
      } satisfies Binary);
    expect(binRes.status).toBe(201);
    const binary = binRes.body as WithId<Binary>;

    const writeUrlRes = await testAgent
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url?upload=true`)
      .auth(accessToken, { type: 'bearer' })
      .send();
    expect(writeUrlRes.status).toBe(200);
    const writeResult = writeUrlRes.body as Parameters;
    const writeUrl = new URL(writeResult.parameter?.[0]?.valueUri as string);

    const uploadRes = await testAgent
      .put(writeUrl.pathname + writeUrl.search)
      .set('Content-Type', 'text/plain')
      .send('foo bar baz quux');
    expect(uploadRes.status).toBe(200);
  });

  test('Requires update permission to generate upload link', async () => {
    const { accessToken } = await createTestProject({
      withAccessToken: true,
      accessPolicy: {
        resource: [{ resourceType: 'Binary', interaction: ['create', 'read'] }],
      },
    });
    const binRes = await request(server)
      .post('/fhir/R4/Binary')
      .auth(accessToken, { type: 'bearer' })
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Binary',
        contentType: 'text/plain',
      } satisfies Binary);
    expect(binRes.status).toBe(201);
    const binary = binRes.body as WithId<Binary>;

    // Read URL should still be available
    const readUrlRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url`)
      .auth(accessToken, { type: 'bearer' })
      .send();
    expect(readUrlRes.status).toBe(200);

    // Write URL not permitted
    const writeUrlRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url?upload=true`)
      .auth(accessToken, { type: 'bearer' })
      .send();
    expect(writeUrlRes.status).toBe(403);
  });
});
