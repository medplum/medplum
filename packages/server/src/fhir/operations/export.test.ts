import { BulkDataExportOutput, Observation, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { createTestProject, initTestAuth, waitFor } from '../../test.setup';
import { systemRepo } from '../repo';
import { exportResourceType } from './export';
import { BulkExporter } from './utils/bulkexporter';
import { createReference } from '@medplum/core';

const app = express();

describe('System export', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const { project } = await createTestProject();
    expect(project).toBeDefined();

    const accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();

    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
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
      .set('Content-Type', 'application/fhir+json')
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
      .set('Content-Type', 'application/fhir+json')
      .set('X-Medplum', 'extended')
      .send({});
    expect(initRes.status).toBe(202);
    expect(initRes.headers['content-location']).toBeDefined();

    // Check the export status
    const contentLocation = new URL(initRes.headers['content-location']);

    let resBody: any;
    await waitFor(async () => {
      const statusRes = await request(app)
        .get(contentLocation.pathname)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(statusRes.status).toBe(200);
      resBody = statusRes.body;
    });

    const output = resBody?.output as BulkDataExportOutput[];
    expect(
      Object.values(output)
        .map((ex) => ex.type)
        .sort()
    ).toEqual(['ClientApplication', 'Observation', 'Patient', 'Project', 'ProjectMembership']);

    // Get the export content
    const outputLocation = new URL(output.find((o) => o.type === 'Observation')?.url as string);
    const dataRes = await request(app)
      .get(outputLocation.pathname + outputLocation.search)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(dataRes.status).toBe(200);

    // Output format is "ndjson", new line delimited JSON
    // However, we only expect one Observation, so we can parse it as JSON
    const resourceJSON = dataRes.text.trim().split('\n');
    expect(resourceJSON).toHaveLength(1);
    expect(JSON.parse(resourceJSON[0])?.subject?.reference).toEqual(`Patient/${res1.body.id}`);
  });

  test('Parameters', async () => {
    const { project } = await createTestProject();
    expect(project).toBeDefined();

    const accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();

    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
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
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: `Patient/${res1.body.id}` },
      });
    expect(res2.status).toBe(201);

    await waitFor(async () => {
      // Create later observation
      const res3 = await request(app)
        .post(`/fhir/R4/Observation`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', 'application/fhir+json')
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { text: 'test2' },
          subject: { reference: `Patient/${res1.body.id}` },
        });
      expect(res3.status).toBe(201);
    });
    const updatedDate = new Date(res2.body.meta.lastUpdated);
    updatedDate.setMilliseconds(updatedDate.getMilliseconds() + 1);

    // Start the export
    let initRes: any;
    await waitFor(async () => {
      initRes = await request(app)
        .post('/fhir/R4/$export')
        .query({
          _type: 'Observation',
          _since: updatedDate.toISOString(),
        })
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', 'application/fhir+json')
        .set('X-Medplum', 'extended')
        .send({});
      expect(initRes.status).toBe(202);
      expect(initRes.headers['content-location']).toBeDefined();
    });

    // Check the export status
    const contentLocation = new URL(initRes?.headers?.['content-location']);

    let resBody: any;
    await waitFor(async () => {
      const statusRes = await request(app)
        .get(contentLocation.pathname)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(statusRes.status).toBe(200);
      resBody = statusRes.body;
    });

    const output = resBody?.output as BulkDataExportOutput[];
    expect(Object.values(output).map((ex) => ex.type)).toEqual(['Observation']);

    // Get the export content
    const outputLocation = new URL(output[0]?.url as string);
    const dataRes = await request(app)
      .get(outputLocation.pathname + outputLocation.search)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(dataRes.status).toBe(200);

    // Output format is "ndjson", new line delimited JSON
    // However, we only expect one Observation, so we can parse it as JSON
    const resourceJSON = dataRes.text.trim().split('\n');
    expect(resourceJSON).toHaveLength(1);
    expect(JSON.parse(resourceJSON[0])?.code?.text).toEqual('test2');
  });

  test('Multiple Resources by Resource Type', async () => {
    const { project } = await createTestProject();
    expect(project).toBeDefined();

    const accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();
    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
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
    await waitFor(async () => {
      // Create observation
      const res2 = await request(app)
        .post(`/fhir/R4/Observation`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', 'application/fhir+json')
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { text: 'test' },
          subject: { reference: `Patient/${res1.body.id}` },
        });
      expect(res2.status).toBe(201);

      // Create 2nd observation
      const res3 = await request(app)
        .post(`/fhir/R4/Observation`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', 'application/fhir+json')
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { text: 'test2' },
          subject: { reference: `Patient/${res1.body.id}` },
        });
      expect(res3.status).toBe(201);

      // Create third observation
      const res4 = await request(app)
        .post(`/fhir/R4/Observation`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', 'application/fhir+json')
        .send({
          resourceType: 'Observation',
          status: 'final',
          code: { text: 'test3' },
          subject: { reference: `Patient/${res1.body.id}` },
        });
      expect(res4.status).toBe(201);
    });
    const updatedDate = new Date(res1.body.meta.lastUpdated);
    updatedDate.setMilliseconds(updatedDate.getMilliseconds() - 100);

    // Start the export
    let initRes: any;
    await waitFor(async () => {
      initRes = await request(app)
        .post('/fhir/R4/$export')
        .query({
          _type: 'Observation',
        })
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', 'application/fhir+json')
        .set('X-Medplum', 'extended')
        .send({});
      expect(initRes.status).toBe(202);
      expect(initRes.headers['content-location']).toBeDefined();
    });

    // Check the export status
    const contentLocation = new URL(initRes?.headers?.['content-location']);

    let resBody: any;
    await waitFor(async () => {
      const statusRes = await request(app)
        .get(contentLocation.pathname)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(statusRes.status).toBe(200);
      resBody = statusRes.body;
    });

    const output = resBody?.output as BulkDataExportOutput[];
    expect(Object.values(output).map((ex) => ex.type)).toEqual(['Observation']);

    // Get the export content
    const outputLocation = new URL(output[0]?.url as string);
    const dataRes = await request(app)
      .get(outputLocation.pathname + outputLocation.search)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(dataRes.status).toBe(200);

    // Output format is "ndjson", new line delimited JSON
    const resourceJSON = dataRes.text.trim().split('\n');
    expect(resourceJSON).toHaveLength(3);
    expect(JSON.parse(resourceJSON[0])?.code?.text).toEqual('test');
  });

  test('exportResourceType iterating through paginated search results', async () => {
    const { project } = await createTestProject();
    expect(project).toBeDefined();
    const exporter = new BulkExporter(systemRepo, undefined);
    const exportWriteResourceSpy = jest.spyOn(exporter, 'writeResource');
    const patient: Patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [
        {
          family: 'Smith',
          given: ['John'],
        },
      ],
    });

    await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'preliminary',
      subject: createReference(patient),
      code: {
        text: 'patient observation 1',
      },
    });

    await systemRepo.createResource<Observation>({
      resourceType: 'Observation',
      status: 'preliminary',
      subject: createReference(patient),
      code: {
        text: 'patient observation 2',
      },
    });
    await exporter.start('http://example.com');

    await exportResourceType(exporter, 'Observation', 1);
    const bulkDataExport = await exporter.close(project);
    expect(bulkDataExport.status).toBe('completed');
    expect(exportWriteResourceSpy).toHaveBeenCalled();
  });
});
