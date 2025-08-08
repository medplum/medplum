// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { Parameters } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

describe('$db-schema-diff', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    // The migration script can log a lot to the console sometimes
    console.log = jest.fn();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: true } });

    const res1 = await request(app)
      .post('/fhir/R4/$db-schema-diff')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res1.status).toBe(200);
    const params = res1.body as Parameters;
    const migrationString = params.parameter?.find((p) => p.name === 'migrationString')?.valueString;
    expect(migrationString).toBeDefined();
    expect(migrationString).toContain('The schema migration needed');
  });

  test('Access denied', async () => {
    const accessToken = await initTestAuth({ project: { superAdmin: false } });

    const res1 = await request(app)
      .post('/fhir/R4/$db-schema-diff')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res1.status).toBe(403);
  });
});
