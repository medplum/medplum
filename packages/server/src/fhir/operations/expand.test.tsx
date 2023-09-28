import { ContentType } from '@medplum/core';
import { OperationOutcome, ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth, withTestContext } from '../../test.setup';
import { systemRepo } from '../repo';
import { expand } from './expand.test';

describe('Expand', () => {
  let app;
  let accessToken;

  beforeAll(async () => {
    app = express();
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('No system', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('Missing url');
  });

  // Add more tests here for each function in expand.test.ts
});
