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

    // Create first patient
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

    // Create a group
    const res3 = await request(app)
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
        ],
      });
    expect(res3.status).toBe(201);

    // Start the export
    const res4 = await request(app)
      .get(`/fhir/R4/Group/${res3.body.id}/$export`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(202);
    expect(res4.headers['content-location']).toBeDefined();

    // Check the export status
    const contentLocation = new URL(res4.headers['content-location']);
    const res5 = await request(app)
      .get(contentLocation.pathname)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5.status).toBe(200);
    expect(res5.body.output).toHaveLength(1);

    // Get the export content
    const outputLocation = new URL(res5.body.output[0].url);
    const res6 = await request(app)
      .get(outputLocation.pathname + outputLocation.search)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toBe(200);
  });
});
