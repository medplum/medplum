// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Binary, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();

describe('Binary/$presigned-url', () => {
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  beforeEach(async () => {
    accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Full write-read cycle', async () => {
    const binRes = await request(app)
      .post('/fhir/R4/Binary')
      .auth(accessToken, { type: 'bearer' })
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Binary',
        contentType: 'text/plain',
      } satisfies Binary);
    expect(binRes.status).toBe(201);
    const binary = binRes.body as WithId<Binary>;

    const writeUrlRes = await request(app)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url?upload=true`)
      .auth(accessToken, { type: 'bearer' })
      .send();
    expect(writeUrlRes.status).toBe(200);
    const writeResult = writeUrlRes.body as Parameters;
    const writeUrl = new URL(writeResult.parameter?.[0]?.valueUri as string);

    console.log(writeUrl.toString());
    const uploadRes = await request(app)
      .put(writeUrl.pathname + writeUrl.search)
      .set('Content-Type', 'text/plain')
      .send('foo bar baz quux');
    expect(uploadRes.status).toBe(200);
  });
});
