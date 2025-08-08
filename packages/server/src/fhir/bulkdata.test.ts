// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { BulkDataExport } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject } from '../test.setup';
import { Repository } from './repo';

const app = express();
let accessToken: string;
let repo: Repository;

describe('Binary', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    const testSetup = await createTestProject({ withAccessToken: true, withRepo: true });
    accessToken = testSetup.accessToken;
    repo = testSetup.repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Legacy resource translation', async () => {
    const exportResource = await repo.createResource<BulkDataExport>({
      resourceType: 'BulkDataExport',
      status: 'completed',
      request: 'foo',
      requestTime: new Date().toISOString(),
      output: [{ url: 'http://example.com/output', type: 'Patient' }],
      error: [{ url: 'http://example.com/error', type: 'Patient' }],
      deleted: [{ url: 'http://example.com/deleted', type: 'Patient' }],
    });

    const initRes = await request(app)
      .get('/fhir/R4/bulkdata/export/' + exportResource.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended');
    expect(initRes.status).toBe(200);
    expect(initRes.body).toMatchObject({
      request: exportResource.request,
      output: exportResource.output,
      error: exportResource.error,
      deleted: exportResource.deleted,
    });
  });

  test('Cancellation', async () => {
    const exportResource = await repo.createResource<BulkDataExport>({
      resourceType: 'BulkDataExport',
      status: 'completed',
      request: 'foo',
      requestTime: new Date().toISOString(),
      output: [{ url: 'http://example.com/output', type: 'Patient' }],
      error: [{ url: 'http://example.com/error', type: 'Patient' }],
      deleted: [{ url: 'http://example.com/deleted', type: 'Patient' }],
    });

    const cancelRes = await request(app)
      .delete('/fhir/R4/bulkdata/export/' + exportResource.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended');
    expect(cancelRes.status).toBe(202);

    const initRes = await request(app)
      .get('/fhir/R4/bulkdata/export/' + exportResource.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended');
    expect(initRes.status).toBe(404);
  });
});
