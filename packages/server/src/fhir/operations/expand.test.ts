import { ContentType, LOINC } from '@medplum/core';
import { OperationOutcome, Project, ValueSet, ValueSetExpansionContains } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth, withTestContext } from '../../test.setup';
import { systemRepo } from '../repo';

const app = express();
let accessToken: string;

describe.each<Partial<Project>>([{ features: [] }, { features: ['terminology'] }])('Expand with %j', (projectProps) => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth(projectProps);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('No ValueSet URL', async () => {
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

  test('No logical definition', async () => {
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
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toMatch(
      /(^Missing ValueSet definition$)|(^No systems found$)/
    );
  });

  test('No filter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/observation-codes')}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.contains.length).toBe(10);
    expect(res.body.expansion.contains[0].system).toBe(LOINC);
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
        )}&filter=rate`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.contains[0].system).toBe(LOINC);
    expect(res.body.expansion.contains[0].display).toMatch(/rate/i);
  });

  test('Success with count and offset', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(
          'http://hl7.org/fhir/ValueSet/observation-codes'
        )}&filter=blood&offset=1&count=1`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.contains.length).toBe(1);
    expect(res.body.expansion.contains[0].system).toBe(LOINC);
    expect(res.body.expansion.contains[0].display).toMatch(/blood/i);
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
        )}&filter=${encodeURIComponent('intention - reported')}`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.expansion.contains[0].system).toBe(LOINC);
    expect(res.body.expansion.contains[0].display).toMatch(/pregnancy intention/i);
  });

  test('Handle empty string after punctuation', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(
          'http://hl7.org/fhir/ValueSet/care-plan-activity-kind'
        )}&filter=${encodeURIComponent('[')}`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('No null `display` field', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/care-plan-activity-kind')}`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const body = res.body as ValueSet;
    expect(body).toBeDefined();

    const contains = body.expansion?.contains;
    expect(contains).toBeDefined();
    expect(contains?.length).toBeGreaterThan(0);
    for (const code of contains as ValueSetExpansionContains[]) {
      if (code.display === null) {
        fail(`Found null display value for coding ${code.system}|${code.code}`);
      }
    }
  });

  test('User uploaded ValueSet', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'https://example.com/fhir/ValueSet/clinical-resources' + randomUUID(),
        expansion: {
          timestamp: '2023-09-13T23:24:00.000Z',
        },
        compose: {
          include: [
            {
              system: 'http://hl7.org/fhir/resource-types',
              concept: [
                {
                  code: 'Patient',
                },
                {
                  code: 'Practitioner',
                },
                {
                  code: 'Observation',
                },
              ],
            },
          ],
        },
      });
    expect(res1.status).toBe(201);
    const url = res1.body.url;

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    expect(res2.body.expansion.contains).toContainEqual({
      system: 'http://hl7.org/fhir/resource-types',
      code: 'Patient',
      display: 'Patient',
    });
    expect(res2.body.expansion.contains).toContainEqual({
      system: 'http://hl7.org/fhir/resource-types',
      code: 'Practitioner',
      display: 'Practitioner',
    });
    expect(res2.body.expansion.contains).toContainEqual({
      system: 'http://hl7.org/fhir/resource-types',
      code: 'Observation',
      display: 'Observation',
    });
  });
});
