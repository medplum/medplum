import { BulkDataExportOutput } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('Group Export', () => {
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

    // Create second patient
    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
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
      .set('Content-Type', 'application/fhir+json')
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
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Device',
      });
    expect(res4.status).toBe(201);

    // Create a group
    const res5 = await request(app)
      .post(`/fhir/R4/Group`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
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
    const res7 = await request(app)
      .get(contentLocation.pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7.status).toBe(200);

    const output = res7.body.output as BulkDataExportOutput[];
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
});
