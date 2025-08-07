// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG, LOINC, SNOMED, createReference } from '@medplum/core';
import {
  CodeSystem,
  OperationOutcome,
  ValueSet,
  ValueSetExpansion,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, initTestAuth, withTestContext } from '../../test.setup';

describe('Expand', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const info = await createTestProject({ withAccessToken: true });
    accessToken = info.accessToken;
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
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toMatch(/^ValueSet .*not found$/);
  });

  test('No logical definition', async () => {
    const url = 'https://example.com/ValueSet/' + randomUUID();
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url,
      });
    expect(res1.status).toStrictEqual(201);

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
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('filter');
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
        contains: expect.arrayContaining([
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
        ]),
      },
    });
  });

  test('Handle punctuation', () =>
    withTestContext(async () => {
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
    }));

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

  test('CodeSystem resolution', async () => {
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      url: 'http://example.com/CodeSystem/foo' + randomUUID(),
      version: '1',
      content: 'not-present',
    };
    const superAdminAccessToken = await initTestAuth({ superAdmin: true });

    // First version of code system
    const res1 = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(codeSystem);
    expect(res1.status).toStrictEqual(201);
    const res2 = await request(app)
      .post(`/fhir/R4/CodeSystem/$import`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: codeSystem.url },
          { name: 'concept', valueCoding: { code: 'foo', display: 'Foo' } },
          { name: 'concept', valueCoding: { code: 'bar', display: 'Bar' } },
        ],
      });
    expect(res2.status).toStrictEqual(200);

    // Second version of code system
    codeSystem.version = '2';
    const res3 = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(codeSystem);
    expect(res3.status).toStrictEqual(201);
    const res4 = await request(app)
      .post(`/fhir/R4/CodeSystem/$import`)
      .set('Authorization', 'Bearer ' + superAdminAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: codeSystem.url },
          { name: 'concept', valueCoding: { code: 'baz', display: 'Baz' } },
          { name: 'concept', valueCoding: { code: 'quux', display: 'Quux' } },
        ],
      });
    expect(res4.status).toStrictEqual(200);

    // ValueSet containing all of target CodeSystem
    const res5 = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'http://example.com/ValueSet/bar' + randomUUID(),
        compose: {
          include: [{ system: codeSystem.url }],
        },
      });
    expect(res5.status).toStrictEqual(201);
    const valueSet = res5.body as ValueSet;

    const res6 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toStrictEqual(200);
  });

  test('ValueSet that uses expansion instead of compose', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'https://example.com/fhir/ValueSet/clinical-resources' + randomUUID(),
        expansion: {
          timestamp: '2024-05-02T06:30:00.000Z',
          total: 4,
          contains: [
            {
              system: HTTP_HL7_ORG + '/fhir/resource-types',
              code: 'Patient',
              display: 'Patient',
            },
            {
              system: HTTP_HL7_ORG + '/fhir/resource-types',
              code: 'Practitioner',
              display: 'Practitioner',
            },
            {
              system: HTTP_HL7_ORG + '/fhir/resource-types',
              code: 'Observation',
              display: 'Observation',
            },
            {
              system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/v3-NullFlavor',
              code: 'UNK',
              display: 'Unknown',
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
    expect(res2.body.expansion.contains).toStrictEqual(
      expect.arrayContaining([
        {
          system: HTTP_HL7_ORG + '/fhir/resource-types',
          code: 'Patient',
          display: 'Patient',
        },
        {
          system: HTTP_HL7_ORG + '/fhir/resource-types',
          code: 'Practitioner',
          display: 'Practitioner',
        },
        {
          system: HTTP_HL7_ORG + '/fhir/resource-types',
          code: 'Observation',
          display: 'Observation',
        },
        {
          system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/v3-NullFlavor',
          code: 'UNK',
          display: 'Unknown',
        },
      ])
    );

    // with a filter parameter
    const res3 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}&filter=p`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.expansion.contains).toStrictEqual(
      expect.arrayContaining([
        {
          system: HTTP_HL7_ORG + '/fhir/resource-types',
          code: 'Patient',
          display: 'Patient',
        },
        {
          system: HTTP_HL7_ORG + '/fhir/resource-types',
          code: 'Practitioner',
          display: 'Practitioner',
        },
      ])
    );
  });

  test('Returns error for recursive definition', async () => {
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      status: 'active',
      url: 'https://example.com/fhir/ValueSet/recursive' + randomUUID(),
      compose: {
        include: [{ valueSet: ['http://example.com/ValueSet/recursive'] }],
      },
    };
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(valueSet);
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toStrictEqual(400);
  });

  test('Subsumption', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&count=200`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(
      expansion.contains?.find(
        (c) => c.system === 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' && c.code === 'FRND'
      )?.display
    ).toStrictEqual('unrelated friend');
  });

  test('Returns error when CodeSystem not found', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'https://example.com/csdne' + randomUUID(),
        expansion: {
          timestamp: '2023-09-13T23:24:00.000Z',
        },
        compose: {
          include: [
            {
              system: 'http://example.com/the-codesystem-does-not-exist',
              concept: [
                {
                  code: '0',
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
    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toStrictEqual(
      'CodeSystem http://example.com/the-codesystem-does-not-exist not found'
    );
  });

  test('Prefers current Project version of common CodeSystem', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'CodeSystem',
        status: 'active',
        url: SNOMED,
        content: 'complete',
        concept: [{ code: '314159265', display: 'Test SNOMED override' }],
      });
    expect(res1.status).toStrictEqual(201);

    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'https://example.com/snomed-all' + randomUUID(),
        compose: {
          include: [
            {
              system: SNOMED,
            },
          ],
        },
      });
    expect(res2.status).toBe(201);

    const res3 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(res2.body.url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    const coding = res3.body.expansion.contains[0];
    expect(coding.system).toBe(SNOMED);
    expect(coding.code).toBe('314159265');
    expect(coding.display).toStrictEqual('Test SNOMED override');
  });

  test('Prefers CodeSystem from linked Projects in link order', async () => {
    // Set up linked Projects and CodeSystem resources
    const url = 'http://example.com/cs' + randomUUID();
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url,
    };

    const { project: p2, accessToken: a2 } = await createTestProject({ withAccessToken: true });
    const cs2 = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + a2)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...codeSystem, concept: [{ code: '1', display: 'Incorrect coding' }] });
    expect(cs2.status).toStrictEqual(201);

    const { project: p1, accessToken: a1 } = await createTestProject({ withAccessToken: true });
    const cs1 = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + a1)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...codeSystem, concept: [{ code: '1', display: 'Correct coding' }] });
    expect(cs1.status).toStrictEqual(201);

    const { project: p3, accessToken: a3 } = await createTestProject({ withAccessToken: true });
    const cs3 = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + a3)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...codeSystem, concept: [{ code: '1', display: 'Another incorrect coding' }] });
    expect(cs3.status).toStrictEqual(201);

    accessToken = await initTestAuth({
      project: {
        link: [{ project: createReference(p1) }, { project: createReference(p2) }, { project: createReference(p3) }],
      },
    });

    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'https://example.com/' + randomUUID(),
        compose: { include: [{ system: url }] },
      });
    expect(res2.status).toBe(201);

    const res3 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(res2.body.url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    const coding = res3.body.expansion.contains[0];
    expect(coding.system).toBe(url);
    expect(coding.code).toBe('1');
    expect(coding.display).toStrictEqual('Correct coding');
  });

  test('Returns error when property filter is invalid for CodeSystem', async () => {
    const res1 = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'CodeSystem',
        status: 'active',
        url: 'http://example.com/custom-code-system',
        content: 'complete',
        hierarchyMeaning: 'grouped-by',
        concept: [{ code: 'A', concept: [{ code: 'B' }] }],
      });
    expect(res1.status).toStrictEqual(201);

    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'https://example.com/invalid-hierarchy' + randomUUID(),
        compose: {
          include: [
            {
              system: 'http://example.com/custom-code-system',
              filter: [{ property: 'concept', op: 'is-a', value: 'A' }],
            },
          ],
        },
      });
    expect(res2.status).toBe(201);

    const res3 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(res2.body.url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(400);
    expect(res3.body.issue[0].details.text).toMatch(/invalid filter/i);
  });

  describe('Hierarchy filters', () => {
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'draft',
      content: 'example',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      hierarchyMeaning: 'is-a',
      concept: [
        {
          code: 'PAR',
          display: 'parent',
          concept: [
            {
              code: 'CHD',
              display: 'child',
            },
            {
              code: 'PET',
              display: 'pet',
            },
          ],
        },
      ],
    };
    const isaValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'draft',
      compose: {
        include: [{ system: codeSystem.url, filter: [{ property: 'code', op: 'is-a', value: 'PAR' }] }],
      },
    };
    const descendentValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'draft',
      compose: {
        include: [{ system: codeSystem.url, filter: [{ property: 'code', op: 'descendent-of', value: 'PAR' }] }],
      },
    };

    beforeAll(async () => {
      const csRes = await request(app)
        .post(`/fhir/R4/CodeSystem`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(codeSystem);
      expect(csRes.status).toBe(201);

      const vsRes1 = await request(app)
        .post(`/fhir/R4/ValueSet`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(isaValueSet);
      expect(vsRes1.status).toBe(201);

      const vsRes2 = await request(app)
        .post(`/fhir/R4/ValueSet`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(descendentValueSet);
      expect(vsRes2.status).toBe(201);
    });

    test('Includes ancestor code in is-a filter', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${isaValueSet.url}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res.status).toStrictEqual(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toHaveLength(3);
      expect(expansion.contains).toStrictEqual(
        expect.arrayContaining<ValueSetExpansionContains>([
          { system, code: 'PAR', display: 'parent' },
          { system, code: 'CHD', display: 'child' },
          { system, code: 'PET', display: 'pet' },
        ])
      );
    });

    test('Text filter with is-a', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${isaValueSet.url}&filter=chi`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res.status).toStrictEqual(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toHaveLength(1);
      expect(expansion.contains).toStrictEqual(
        expect.arrayContaining<ValueSetExpansionContains>([{ system, code: 'CHD', display: 'child' }])
      );
    });

    test('Excludes ancestor code in descendent-of filter', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${descendentValueSet.url}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res.status).toStrictEqual(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toHaveLength(2);
      expect(expansion.contains).toStrictEqual(
        expect.arrayContaining([
          { system, code: 'CHD', display: 'child' },
          { system, code: 'PET', display: 'pet' },
        ])
      );
    });

    test('Text filter with descendent-of', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${descendentValueSet.url}&filter=pet`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res.status).toStrictEqual(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toHaveLength(1);
      expect(expansion.contains).toStrictEqual(expect.arrayContaining([{ system, code: 'PET', display: 'pet' }]));
    });
  });

  test('Recursive subsumption', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&count=200`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(
      expansion.contains?.filter((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v2-0131')
    ).toHaveLength(12);
    expect(
      expansion.contains?.filter((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v3-RoleCode')
    ).toHaveLength(110);
    const abstractCode = expansion.contains?.find((c) => c.code === '_PersonalRelationshipRoleType');
    expect(abstractCode).toBeDefined();
  });

  test('Recursive subsumption with filter', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&filter=adopt&count=200`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    const expandedCodes = expansion.contains?.map((coding) => coding.code);
    expect(expandedCodes).toHaveLength(6);
    expect(expandedCodes).toStrictEqual(
      expect.arrayContaining(['ADOPTP', 'ADOPTF', 'ADOPTM', 'CHLDADOPT', 'DAUADOPT', 'SONADOPT'])
    );
  });

  test('Filter out abstract codes', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&count=200&excludeNotForUI=true`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(
      expansion.contains?.filter((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v3-RoleCode')
    ).toHaveLength(109);
    const abstractCode = expansion.contains?.find((c) => c.code === '_PersonalRelationshipRoleType');
    expect(abstractCode).toBeUndefined();
  });

  test('Property filter', async () => {
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      status: 'active',
      url: 'https://example.com/fhir/ValueSet/property-filter' + randomUUID(),
      compose: {
        include: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
            filter: [{ property: 'status', op: '=', value: 'retired' }],
          },
        ],
      },
    };
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(valueSet);
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toStrictEqual(200);
    const expansion = res2.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains?.[0]?.code).toStrictEqual('ERECCAP');
  });

  test('Property filter with multiple values', async () => {
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      status: 'active',
      url: 'https://example.com/fhir/ValueSet/property-filter' + randomUUID(),
      compose: {
        include: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
            filter: [{ property: 'status', op: 'in', value: 'preferred,retired' }],
          },
        ],
      },
    };
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(valueSet);
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toStrictEqual(200);
    const expansion = res2.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains?.[0]?.code).toStrictEqual('ERECCAP');
  });

  test('Reference to other ValueSet', async () => {
    const valueSetResource: ValueSet = {
      resourceType: 'ValueSet',
      status: 'draft',
      url: 'http://example.com/ValueSet/reference-' + randomUUID(),
      compose: {
        include: [
          { valueSet: ['http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype'] },
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            filter: [
              {
                property: 'concept',
                op: 'is-a',
                value: 'RESPRSN',
              },
            ],
          },
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            concept: [{ code: 'SEE' }],
          },
        ],
      },
    };
    const valueSetRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(valueSetResource);
    expect(valueSetRes.status).toStrictEqual(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&count=200`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(
      expansion.contains?.filter((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v2-0131')
    ).toHaveLength(12);
    expect(
      expansion.contains?.filter((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v3-RoleCode')
    ).toHaveLength(119);

    const abstractCode = expansion.contains?.find((c) => c.code === '_PersonalRelationshipRoleType');
    expect(abstractCode).toBeDefined();
    const filterCode = expansion.contains?.find((c) => c.code === 'HPOWATT');
    expect(filterCode?.display).toStrictEqual('healthcare power of attorney');
    const explicitCode = expansion.contains?.find((c) => c.code === 'SEE');
    expect(explicitCode?.display).toStrictEqual('Seeing');
  });

  test('Display text override', async () => {
    const valueSetResource: ValueSet = {
      resourceType: 'ValueSet',
      status: 'draft',
      url: 'http://example.com/ValueSet/reference-' + randomUUID(),
      compose: {
        include: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            concept: [{ code: 'SEE', display: 'Seeing-eye doggo' }],
          },
        ],
      },
    };
    const valueSetRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(valueSetResource);
    expect(valueSetRes.status).toStrictEqual(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&count=200&filter=doggo`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains?.[0]).toMatchObject({
      code: 'SEE',
      system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
      display: 'Seeing-eye doggo',
    });
  });

  test('Minimum filter size for hierarchical expansion', async () => {
    const valueSetResource: ValueSet = {
      resourceType: 'ValueSet',
      status: 'draft',
      url: 'http://example.com/ValueSet/reference-' + randomUUID(),
      compose: {
        include: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            filter: [
              {
                property: 'concept',
                op: 'is-a',
                value: '_PersonalRelationshipRoleType',
              },
            ],
          },
        ],
      },
    };
    const valueSetRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(valueSetResource);
    expect(valueSetRes.status).toStrictEqual(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=a&count=200`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toBeUndefined();
  });

  test('Expand with empty filter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/task-status|4.0.1&filter=`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toHaveLength(12);
  });

  test('Expand with trailing quote', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/task-status|4.0.1&filter=a'`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toBeUndefined();
  });

  test('Exact code match', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=http://terminology.hl7.org/ValueSet/v3-RoleCode&filter=MT`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains).toContainEqual<ValueSetExpansionContains>({
      system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
      code: 'MT',
      display: 'Meat',
    });
  });

  test('Exact code match with abstract filter', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=http://terminology.hl7.org/ValueSet/v3-RoleCode&filter=MT&excludeNotForUI=true`
      )
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains).toContainEqual<ValueSetExpansionContains>({
      system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
      code: 'MT',
      display: 'Meat',
    });
  });

  test('Include pre-expanded ValueSet', async () => {
    const preexpanded: ValueSet = {
      resourceType: 'ValueSet',
      status: 'draft',
      url: 'http://example.com/ValueSet/pre-expanded-' + randomUUID(),
      expansion: {
        timestamp: new Date().toISOString(),
        contains: [
          {
            system: 'http://loinc.org',
            code: '82810-3',
            display: 'Pregnancy status',
            contains: [
              {
                system: 'http://loinc.org',
                code: '86645-9',
                display: 'Pregnancy intention in the next year - Reported',
              },
            ],
          },
        ],
      },
    };
    const preexpandedRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(preexpanded);
    expect(preexpandedRes.status).toStrictEqual(201);
    const preexpandedValueSet = preexpandedRes.body as ValueSet;

    const include: ValueSet = {
      resourceType: 'ValueSet',
      status: 'draft',
      url: 'http://example.com/ValueSet/include-expanded-' + randomUUID(),
      compose: {
        include: [
          { valueSet: [preexpandedValueSet.url as string] },
          {
            system: 'http://loinc.org',
            concept: [
              { code: '8480-6', display: 'Systolic BP - Reported' },
              { code: '8462-4', display: 'Diastolic BP - Reported' },
            ],
          },
        ],
      },
    };
    const valueSetRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(include);
    expect(valueSetRes.status).toStrictEqual(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=reported`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toHaveLength(3);
    expect(expansion.contains).toStrictEqual(
      expect.arrayContaining([
        {
          system: 'http://loinc.org',
          code: '86645-9',
          display: 'Pregnancy intention in the next year - Reported',
        },
        {
          system: 'http://loinc.org',
          code: '8480-6',
          display: 'Systolic BP - Reported',
        },
        {
          system: 'http://loinc.org',
          code: '8462-4',
          display: 'Diastolic BP - Reported',
        },
      ])
    );
  });

  test('Resolve synonyms', async () => {
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      property: [
        {
          code: 'SY',
          uri: 'http://hl7.org/fhir/concept-properties#synonym',
          type: 'string',
        },
      ],
      content: 'example',
      status: 'draft',
      concept: [
        {
          code: 'UTIC',
          display: 'Uticarial rash',
          property: [
            {
              code: 'SY',
              valueString: 'Hives',
            },
          ],
        },
      ],
    };
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      status: 'draft',
      url: 'https://example.com/ValueSet/' + randomUUID(),
      compose: { include: [{ system: codeSystem.url }] },
    };
    const csRes = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(codeSystem);
    expect(csRes.status).toStrictEqual(201);
    const vsRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(valueSet);
    expect(vsRes.status).toStrictEqual(201);

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=hives`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toStrictEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'UTIC', display: 'Hives', system: codeSystem.url },
    ]);
  });
});
