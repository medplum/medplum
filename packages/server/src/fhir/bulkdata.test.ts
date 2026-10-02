// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { AsyncJob, BulkDataExport } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject } from '../test.setup';
import type { Repository } from './repo';

const app = express();
let accessToken: string;
let repo: Repository;

describe('Bulk data status', () => {
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
    expect(initRes).toHaveStatus(200);
    expect(initRes.body).toMatchObject({
      request: exportResource.request,
      output: exportResource.output,
      error: exportResource.error,
      deleted: exportResource.deleted,
    });
  });

  test('Failed exports return a terminal error without exposing internal details', async () => {
    const job = await repo.createResource<AsyncJob>({
      resourceType: 'AsyncJob',
      status: 'error',
      request: 'https://example.com/fhir/R4/$export',
      requestTime: new Date().toISOString(),
      output: { resourceType: 'Parameters', parameter: [{ name: 'error', valueString: 'Internal storage details' }] },
    });
    const res = await request(app)
      .get('/fhir/R4/bulkdata/export/' + job.id)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(500);
    expect(res.body.resourceType).toBe('OperationOutcome');
    expect(JSON.stringify(res.body)).not.toContain('Internal storage details');
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
    expect(cancelRes).toHaveStatus(202);

    const initRes = await request(app)
      .get('/fhir/R4/bulkdata/export/' + exportResource.id)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended');
    expect(initRes).toHaveStatus(404);
  });
});
