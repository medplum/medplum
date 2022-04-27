import { ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initTestAuth } from '../test.setup';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();
let accessToken: string;

describe('CSV Export', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Export Patient', async () => {
    // Create a patient that we want to export
    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Patient',
        name: [
          {
            given: ['Alice'],
            family: 'Smith',
          },
        ],
        address: [
          {
            use: 'home',
            line: ['123 Main St'],
            city: 'Anywhere',
            state: 'CA',
            postalCode: '90210',
          },
        ],
        telecom: [
          {
            system: 'phone',
            value: '555-555-5555',
          },
          {
            system: 'email',
            value: 'alice@example.com',
          },
        ],
      });
    expect(res1.status).toBe(201);

    // Also create an empty patient to make sure we handle missing values
    const res2 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Patient',
      });
    expect(res2.status).toBe(201);

    const res3 = await request(app)
      .get(`/fhir/R4/Patient/$csv`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.text).toContain(res1.body.id);
    expect(res3.text).toContain(res2.body.id);
    expect(res3.text).toContain('123 Main St');
    expect(res3.text).toContain('555-555-5555');
    expect(res3.text).toContain('alice@example.com');
  });

  test('Export ServiceRequest', async () => {
    const serviceRequest: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      subject: {
        reference: 'Patient/' + randomUUID(),
        display: 'Alice Smith',
      },
      code: {
        coding: [
          {
            system: 'https://example.com',
            code: 'test1',
            display: 'test1',
          },
        ],
      },
      orderDetail: [
        {
          text: 'Shipped',
        },
      ],
    };

    // Create a service requeset that we want to export
    const res1 = await request(app)
      .post(`/fhir/R4/ServiceRequest`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send(serviceRequest);
    expect(res1.status).toBe(201);

    const res3 = await request(app)
      .get(`/fhir/R4/ServiceRequest/$csv`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.text).toContain(res1.body.id);
    expect(res3.text).toContain('Alice Smith');
    expect(res3.text).toContain('test1');
    expect(res3.text).toContain('Shipped');
  });

  test('Invalid resource type', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patientx/$csv`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });
});
