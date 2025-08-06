// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { BulkDataExportOutput, Observation } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { FileSystemStorage } from '../../storage/filesystem';
import { getBinaryStorage } from '../../storage/loader';
import { createTestProject, initTestAuth, waitForAsyncJob, withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';
import { exportResourceType } from './export';
import { BulkExporter } from './utils/bulkexporter';

describe('Export', () => {
  const app = express();
  const systemRepo = getSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const accessToken = await initTestAuth({ membership: { admin: true } });
    expect(accessToken).toBeDefined();

    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
        address: [{ use: 'home', line: ['123 Main St'], city: 'Anywhere', state: 'CA', postalCode: '90210' }],
        telecom: [
          { system: 'phone', value: '555-555-5555' },
          { system: 'email', value: 'alice@example.com' },
        ],
      });
    expect(res1.status).toBe(201);

    // Create observation
    const res2 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: `Patient/${res1.body.id}` },
      });
    expect(res2.status).toBe(201);

    // Start the export
    const initRes = await request(app)
      .post('/fhir/R4/$export')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    expect(initRes.status).toBe(202);
    expect(initRes.headers['content-location']).toBeDefined();

    // Check the export status
    const contentLocation = new URL(initRes.headers['content-location']);
    await waitForAsyncJob(initRes.headers['content-location'], app, accessToken);

    const statusRes = await request(app)
      .get(contentLocation.pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(statusRes.status).toBe(200);
    const resBody = statusRes.body;

    const output = resBody?.output as BulkDataExportOutput[];
    expect(
      Object.values(output)
        .map((ex) => ex.type)
        .sort()
    ).toStrictEqual(['ClientApplication', 'Observation', 'Patient', 'Project', 'ProjectMembership']);

    // Get the export content
    const outputLocation = new URL(output.find((o) => o.type === 'Observation')?.url as string);
    const outputContent = (getBinaryStorage() as FileSystemStorage).readFileByUrlForTests(outputLocation);

    // Output format is "ndjson", new line delimited JSON
    // However, we only expect one Observation, so we can parse it as JSON
    const resourceJSON = outputContent.trim().split('\n');
    expect(resourceJSON).toHaveLength(1);
    expect(JSON.parse(resourceJSON[0])?.subject?.reference).toStrictEqual(`Patient/${res1.body.id}`);
  });

  test('System Export Accepted with GET', async () => {
    const accessToken = await initTestAuth();

    // Start the export
    const initRes = await request(app)
      .get('/fhir/R4/$export')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    expect(initRes.status).toBe(202);
    expect(initRes.headers['content-location']).toBeDefined();
    await waitForAsyncJob(initRes.headers['content-location'], app, accessToken);
  });

  test('Patient Export Accepted with GET', async () => {
    const accessToken = await initTestAuth();

    // Start the export
    const initRes = await request(app)
      .get('/fhir/R4/Patient/$export')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({});
    expect(initRes.status).toBe(202);
    expect(initRes.headers['content-location']).toBeDefined();
    await waitForAsyncJob(initRes.headers['content-location'], app, accessToken);
  });

  test('exportResourceType iterating through paginated search results', async () =>
    withTestContext(async () => {
      await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'preliminary',
        subject: { reference: 'Patient/123' },
        code: {
          text: 'patient observation 1',
        },
      });

      await systemRepo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'preliminary',
        subject: { reference: 'Patient/123' },
        code: {
          text: 'patient observation 2',
        },
      });

      const exporter = new BulkExporter(systemRepo);
      const exportWriteResourceSpy = jest.spyOn(exporter, 'writeResource');
      await exporter.start('http://example.com');

      const { project } = await createTestProject();
      expect(project).toBeDefined();
      await exportResourceType(exporter, 'Observation', 1);
      const bulkDataExport = await exporter.close(project);
      expect(bulkDataExport.status).toBe('completed');
      expect(exportWriteResourceSpy).toHaveBeenCalled();
    }));
});
