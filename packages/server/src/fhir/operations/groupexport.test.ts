import { ContentType } from '@medplum/core';
import { BulkDataExportOutput, Group, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { createTestProject, initTestAuth, waitForAsyncJob, withTestContext } from '../../test.setup';
import { getSystemRepo } from '../repo';
import { groupExportResources } from './groupexport';
import { BulkExporter } from './utils/bulkexporter';

describe('Group Export', () => {
  const app = express();
  const systemRepo = getSystemRepo();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Export Group', async () => {
    // Create first patient
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

    // Create second patient
    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['Bob'], family: 'Jones' }],
        address: [{ use: 'home', line: ['456 Happy St'], city: 'Anywhere', state: 'CA', postalCode: '90210' }],
        telecom: [
          { system: 'phone', value: '555-555-1234' },
          { system: 'email', value: 'bob@example.com' },
        ],
      });
    expect(res2.status).toBe(201);

    // Create observation
    const res3 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: `Patient/${res1.body.id}` },
      });
    expect(res3.status).toBe(201);

    // Create device
    const res4 = await request(app)
      .post(`/fhir/R4/Device`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Device',
      });
    expect(res4.status).toBe(201);

    // Create a group
    const res5 = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Group',
        type: 'person',
        actual: true,
        member: [
          { entity: { reference: `Patient/${res1.body.id}` } },
          { entity: { reference: `Patient/${res2.body.id}` } },
          { entity: { reference: `Device/${res4.body.id}` } },
        ],
      });
    expect(res5.status).toBe(201);

    // Start the export
    const res6 = await request(app)
      .get(`/fhir/R4/Group/${res5.body.id}/$export`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(202);
    expect(res6.headers['content-location']).toBeDefined();

    // Check the export status
    const contentLocation = new URL(res6.headers['content-location']);
    await waitForAsyncJob(res6.headers['content-location'], app, accessToken);

    const contentLocationRes = await request(app)
      .get(contentLocation.pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contentLocationRes.status).toBe(200);

    const output = contentLocationRes.body.output as BulkDataExportOutput[];
    expect(output).toHaveLength(4);
    expect(output.some((o) => o.type === 'Patient')).toBeTruthy();
    expect(output.some((o) => o.type === 'Device')).toBeTruthy();
    expect(output.some((o) => o.type === 'Observation')).toBeTruthy();
    expect(output.some((o) => o.type === 'Group')).toBeTruthy();
    // Get the export content
    const outputLocation = new URL(output[0].url as string);
    const res8 = await request(app)
      .get(outputLocation.pathname + outputLocation.search)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res8.status).toBe(200);
  });

  test('Since filter', async () => {
    const now = new Date();

    // 7 days ago
    const before = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);

    // 3 days ago
    const since = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3);

    // Create patient
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
    // (Use extended mode to get the project metadata)
    const res2 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: `Patient/${res1.body.id}` },
      });
    expect(res2.status).toBe(201);

    // Create observation "3 days ago"
    // (Use systemRepo to set meta.lastUpdated)
    await withTestContext(() =>
      systemRepo.createResource({
        ...res2.body,
        id: undefined,
        meta: {
          ...res2.body.meta,
          lastUpdated: before.toISOString(),
          versionId: undefined,
        },
      })
    );

    // Create group
    const res4 = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Group',
        type: 'person',
        actual: true,
        member: [{ entity: { reference: `Patient/${res1.body.id}` } }],
      });
    expect(res4.status).toBe(201);

    // Start the export with the "_since" filter
    const res5 = await request(app)
      .get(`/fhir/R4/Group/${res4.body.id}/$export?_since=${encodeURIComponent(since.toISOString())}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5.status).toBe(202);
    expect(res5.headers['content-location']).toBeDefined();

    // Check the export status
    const contentLocation = new URL(res5.headers['content-location']);
    await waitForAsyncJob(res5.headers['content-location'], app, accessToken);

    const contentLocationRes = await request(app)
      .get(contentLocation.pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contentLocationRes.status).toBe(200);

    const output = contentLocationRes.body.output as BulkDataExportOutput[];
    expect(output).toHaveLength(3);
    expect(output.some((o) => o.type === 'Patient')).toBeTruthy();
    expect(output.some((o) => o.type === 'Observation')).toBeTruthy();

    // Get the export content
    const outputLocation = new URL(output.find((o) => o.type === 'Observation')?.url as string);
    const res7 = await request(app)
      .get(outputLocation.pathname + outputLocation.search)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7.status).toBe(200);

    // Output format is "ndjson", new line delimited JSON
    // However, we only expect one Observation, so we can parse it as JSON
    expect(res7.text.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(res7.text).id).toEqual(res2.body.id);
  });

  test('Type filter', async () => {
    // Create patient
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
    // (Use extended mode to get the project metadata)
    const res2 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: `Patient/${res1.body.id}` },
      });
    expect(res2.status).toBe(201);

    // Create group
    const res3 = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Group',
        type: 'person',
        actual: true,
        member: [{ entity: { reference: `Patient/${res1.body.id}` } }],
      });
    expect(res3.status).toBe(201);

    // Start the export with the "_type" filter
    const res4 = await request(app)
      .get(`/fhir/R4/Group/${res3.body.id}/$export?_type=Patient`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(202);
    expect(res4.headers['content-location']).toBeDefined();

    // Check the export status
    const contentLocation = new URL(res4.headers['content-location']);
    await waitForAsyncJob(res4.headers['content-location'], app, accessToken);

    const contentLocationRes = await request(app)
      .get(contentLocation.pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(contentLocationRes.status).toBe(200);

    const output = contentLocationRes.body.output as BulkDataExportOutput[];
    expect(output.some((o) => o.type === 'Patient')).toBeTruthy();
    expect(output.some((o) => o.type === 'Observation')).not.toBeTruthy();
  });

  test('status accepted with error', async () => {
    // Create group
    const groupRes = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Group',
        type: 'person',
        actual: true,
        member: [{ entity: { reference: `Patient/1234` } }],
      });
    expect(groupRes.status).toBe(201);
    const res4 = await request(app)
      .get(`/fhir/R4/Group/${groupRes.body.id}/$export`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(202);
    expect(res4.headers['content-location']).toBeDefined();
    await waitForAsyncJob(res4.headers['content-location'], app, accessToken);
  });

  test('groupExportResources without members', async () => {
    const { project } = await createTestProject();
    expect(project).toBeDefined();
    const exporter = new BulkExporter(systemRepo, undefined);
    const exportWriteResourceSpy = jest.spyOn(exporter, 'writeResource');

    const group: Group = await systemRepo.createResource<Group>({
      resourceType: 'Group',
      type: 'person',
      actual: true,
    });
    await exporter.start('http://example.com');
    await groupExportResources(exporter, project, group, systemRepo);
    const bulkDataExport = await exporter.close(project);
    expect(bulkDataExport.status).toBe('completed');
    expect(exportWriteResourceSpy).toHaveBeenCalledTimes(0);
  });

  test('groupExportResources members without reference', async () => {
    const { project } = await createTestProject();
    expect(project).toBeDefined();
    const exporter = new BulkExporter(systemRepo, undefined);

    const patient: Patient = await systemRepo.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
      address: [{ use: 'home', line: ['123 Main St'], city: 'Anywhere', state: 'CA', postalCode: '90210' }],
      telecom: [
        { system: 'phone', value: '555-555-5555' },
        { system: 'email', value: 'alice@example.com' },
      ],
    });
    const group: Group = await systemRepo.createResource<Group>({
      resourceType: 'Group',
      type: 'person',
      actual: true,
      member: [{ entity: { reference: '' } }, { entity: { reference: `Patient/${patient.id}` } }],
    });
    await exporter.start('http://example.com');
    await groupExportResources(exporter, project, group, systemRepo);
    const bulkDataExport = await exporter.close(project);
    expect(bulkDataExport.status).toBe('completed');
  });
});
