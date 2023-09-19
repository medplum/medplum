import { ContentType } from '@medplum/core';
import { OperationOutcome, ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth, withTestContext } from '../../test.setup';
import { systemRepo } from '../repo';

const app = express();
let accessToken: string;

describe('Expand', () => {
  beforeAll(async () => {
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

  test('ValueSet not found', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://example.com/ValueSet/123')}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('ValueSet not found');
  });

  test('No systems', async () => {
    const url = 'https://example.com/ValueSet/' + randomUUID();
    await withTestContext(() =>
      systemRepo.createResource({
        resourceType: 'ValueSet',
        status: 'active',
        url,
      })
    );
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('No systems found');
  });

  test('No filter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/observation-codes')}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.contains.length).toBe(10);
    expect(res.body.expansion.contains[0].system).toBe('http://loinc.org');
  });

  test('Invalid filter', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(
          'http://hl7.org/fhir/ValueSet/observation-codes'
        )}&filter=a&filter=b`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('Invalid filter');
  });

  test('Success', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(
          'http://hl7.org/fhir/ValueSet/observation-codes'
        )}&filter=left`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.contains[0].system).toBe('http://loinc.org');
    expect(res.body.expansion.contains[0].display).toMatch(/left/i);
  });

  test('Success with count and offset', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(
          'http://hl7.org/fhir/ValueSet/observation-codes'
        )}&filter=left&offset=1&count=1`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.offset).toBe(1);
    expect(res.body.expansion.contains.length).toBe(1);
    expect(res.body.expansion.contains[0].system).toBe('http://loinc.org');
    expect(res.body.expansion.contains[0].display).toMatch(/left/i);
  });

  test('Resource types', async () => {
    const valueSet = 'http://hl7.org/fhir/ValueSet/resource-types|4.0.1';
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet)}&filter=Patient`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resourceType: 'ValueSet',
      url: 'http://hl7.org/fhir/ValueSet/resource-types',
      expansion: {
        offset: 0,
        contains: [
          {
            system: 'http://hl7.org/fhir/resource-types',
            code: 'Patient',
            display: 'Patient',
          },
        ],
      },
    });
  });

  test('No duplicates', async () => {
    const valueSet = 'http://hl7.org/fhir/ValueSet/subscription-status|4.0.1';
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet)}&filter=active`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resourceType: 'ValueSet',
      url: 'http://hl7.org/fhir/ValueSet/subscription-status',
      expansion: {
        offset: 0,
        contains: [
          {
            system: 'http://hl7.org/fhir/subscription-status',
            code: 'active',
            display: 'Active',
          },
        ],
      },
    });
    expect(res.body.expansion.contains.length).toBe(1);
  });

  test('External system', async () => {
    const valueSet = 'http://hl7.org/fhir/ValueSet/servicerequest-category';
    const filter = 'imaging';
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet)}&filter=${encodeURIComponent(filter)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resourceType: 'ValueSet',
      url: valueSet,
      expansion: {
        offset: 0,
        contains: [
          {
            system: 'http://snomed.info/sct',
            code: '363679005',
            display: 'Imaging',
          },
        ],
      },
    });
  });

  test('Marital status', async () => {
    // This is a good test, because it covers a bunch of edge cases.
    // Marital status is the combination of two code systems: http://hl7.org/fhir/v3/MaritalStatus and http://hl7.org/fhir/v3/NullFlavor
    // For NullFlavor, it specifies a subset of codes
    // For MaritalStatus, it does not
    const valueSet = 'http://hl7.org/fhir/ValueSet/marital-status';
    const filter = 'married';
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet)}&filter=${encodeURIComponent(filter)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resourceType: 'ValueSet',
      url: valueSet,
      expansion: {
        offset: 0,
        contains: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
            code: 'M',
            display: 'Married',
          },
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
            code: 'S',
            display: 'Never Married',
          },
        ],
      },
    });
  });

  test('Handle punctuation', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(
          'http://hl7.org/fhir/ValueSet/observation-codes'
        )}&filter=${encodeURIComponent('(left)')}`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.contains[0].system).toBe('http://loinc.org');
    expect(res.body.expansion.contains[0].display).toMatch(/left/i);
  });

  test('No null `display` field', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/observation-codes')}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const body = res.body as ValueSet;
    expect(body).toBeDefined();

    let foundNullDisplay = false;
    const contains = body.expansion?.contains;
    expect(contains).toBeDefined();
    expect(contains?.length).toBeGreaterThan(0);
    for (const code of contains as ValueSetExpansionContains[]) {
      if (code.display && code.display === null) {
        foundNullDisplay = true;
        break;
      }
    }

    expect(foundNullDisplay).toBe(false);
  });

  test('User uploaded ValueSet', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'https://example.com/fhir/ValueSet/fruits',
        expansion: {
          timestamp: '2023-09-13T23:24:00.000Z',
        },
        compose: {
          include: [
            {
              system: 'http://example.com/fruits',
              concept: [
                {
                  code: 'apple',
                  display: 'Apple',
                },
                {
                  code: 'banana',
                  display: 'Banana',
                },
                {
                  code: 'cherry',
                  display: 'Cherry',
                },
              ],
            },
          ],
        },
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('https://example.com/fhir/ValueSet/fruits')}&filter=apple`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    expect(res2.body.expansion.contains[0].system).toBe('http://example.com/fruits');
    expect(res2.body.expansion.contains[0].display).toMatch(/apple/i);
  });
});
