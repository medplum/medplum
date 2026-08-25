// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG, LOINC, SNOMED, createReference } from '@medplum/core';
import type {
  CodeSystem,
  OperationOutcome,
  ValueSet,
  ValueSetComposeIncludeFilter,
  ValueSetExpansion,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject, initTestAuth, withTestContext } from '../../test.setup';
import { repoAccess } from '../repository/access-tracker';
import type { PgQueryable } from '../sql';
import { SqlBuilder } from '../sql';
import { addExpansionItems, countCandidatesBounded, expansionQuery, hydrateCodeSystemProperties } from './expand';
import { abstractProperty } from './utils/terminology';

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
    expect(res).toHaveStatus(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('Missing url');
  });

  test('ValueSet not found', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://example.com/ValueSet/123')}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(400);
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
    expect(res1).toHaveStatus(201);

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toMatch(
      /(^Missing ValueSet definition$)|(^No systems found$)/
    );
  });

  test('No filter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/observation-codes')}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains.length).toBe(10);
    expect(res.body.expansion.contains[0].system).toBe(LOINC);
  });

  test('Multiple filters', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(
          'http://hl7.org/fhir/ValueSet/observation-codes'
        )}&filter=a&filter=b`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('filter');
  });

  test('Invalid filter', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(
          'http://hl7.org/fhir/ValueSet/observation-codes'
        )}&filter=%00a`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(400);
    expect((res.body as OperationOutcome).issue?.[0].details?.text).toContain('null byte');
  });

  test('Filter token limit', async () => {
    const url = 'http://hl7.org/fhir/ValueSet/observation-codes';
    const acceptedFilter = Array(10).fill('rate').join(' ');
    const accepted = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}&filter=${encodeURIComponent(acceptedFilter)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(accepted).toHaveStatus(200);

    const rejectedFilter = Array(11).fill('rate').join(' ');
    const rejected = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}&filter=${encodeURIComponent(rejectedFilter)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(rejected).toHaveStatus(400);
    expect((rejected.body as OperationOutcome).issue?.[0].details?.text).toContain(
      'Filter value cannot contain more than 10 tokens'
    );
  });

  test('Success', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(
          'http://hl7.org/fhir/ValueSet/observation-codes'
        )}&filter=rate`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
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
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains.length).toBe(1);
    expect(res.body.expansion.contains[0].system).toBe(LOINC);
    expect(res.body.expansion.contains[0].display).toMatch(/blood/i);
  });

  test('No duplicates', async () => {
    const valueSet = 'http://hl7.org/fhir/ValueSet/subscription-status|4.0.1';
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet)}&filter=active`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
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
    expect(res).toHaveStatus(200);
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
      expect(res).toHaveStatus(200);
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
    expect(res).toHaveStatus(200);
  });

  test('No null `display` field', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/care-plan-activity-kind')}`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);

    const body = res.body as ValueSet;
    expect(body).toBeDefined();

    const contains = body.expansion?.contains;
    expect(contains).toBeDefined();
    expect(contains?.length).toBeGreaterThan(0);
    for (const code of contains as ValueSetExpansionContains[]) {
      if (code.display === null) {
        expect.fail(`Found null display value for coding ${code.system}|${code.code}`);
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
    expect(res1).toHaveStatus(201);
    const url = res1.body.url;

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
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
    expect(res1).toHaveStatus(201);
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
    expect(res2).toHaveStatus(200);

    // Second version of code system
    codeSystem.version = '2';
    const res3 = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(codeSystem);
    expect(res3).toHaveStatus(201);
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
    expect(res4).toHaveStatus(200);

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
    expect(res5).toHaveStatus(201);
    const valueSet = res5.body as ValueSet;

    const res6 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6).toHaveStatus(200);
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
    expect(res1).toHaveStatus(201);
    const url = res1.body.url;

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
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
    expect(res3).toHaveStatus(200);
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
    expect(res1).toHaveStatus(201);

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(400);
  });

  test('Subsumption', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&count=200`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
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
    expect(res1).toHaveStatus(201);
    const url = res1.body.url;

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(400);
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
    expect(res1).toHaveStatus(201);

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
    expect(res2).toHaveStatus(201);

    const res3 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(res2.body.url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
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
    expect(cs2).toHaveStatus(201);

    const { project: p1, accessToken: a1 } = await createTestProject({ withAccessToken: true });
    const cs1 = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + a1)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...codeSystem, concept: [{ code: '1', display: 'Correct coding' }] });
    expect(cs1).toHaveStatus(201);

    const { project: p3, accessToken: a3 } = await createTestProject({ withAccessToken: true });
    const cs3 = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + a3)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...codeSystem, concept: [{ code: '1', display: 'Another incorrect coding' }] });
    expect(cs3).toHaveStatus(201);

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
    expect(res2).toHaveStatus(201);

    const res3 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(res2.body.url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(200);
    const coding = res3.body.expansion.contains[0];
    expect(coding.system).toBe(url);
    expect(coding.code).toBe('1');
    expect(coding.display).toStrictEqual('Correct coding');
  });

  test('Does not leak extended metadata when multiple ValueSets share a URL', async () => {
    const url = 'https://example.com/vs-' + randomUUID();
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      status: 'active',
      url,
      compose: { include: [{ system: LOINC, concept: [{ code: '1-8', display: 'Test' }] }] },
    };

    const { accessToken: linkedAccessToken, project: linkedProject } = await createTestProject({
      withAccessToken: true,
    });
    const linkedRes = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + linkedAccessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(valueSet);
    expect(linkedRes).toHaveStatus(201);

    accessToken = await initTestAuth({ project: { link: [{ project: createReference(linkedProject) }] } });
    const ownRes = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(valueSet);
    expect(ownRes).toHaveStatus(201);

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    expect(res.body.id).toStrictEqual(ownRes.body.id);
    expect(res.body.meta.project).toBeUndefined();
    expect(res.body.meta.author).toBeUndefined();
    expect(res.body.meta.compartment).toBeUndefined();
  });

  test('Expands ValueSet with explicit concepts from fragment CodeSystem', async () => {
    const csUrl = 'http://example.com/fragment-cs-' + randomUUID();

    const csRes = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'CodeSystem',
        status: 'active',
        url: csUrl,
        content: 'fragment',
        concept: [
          { code: 'A', display: 'Concept A' },
          { code: 'B', display: 'Concept B' },
        ],
      });
    expect(csRes).toHaveStatus(201);

    const vsUrl = 'http://example.com/vs-fragment-' + randomUUID();
    const vsRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        status: 'active',
        url: vsUrl,
        compose: {
          include: [{ system: csUrl, concept: [{ code: 'A', display: 'Concept A' }] }],
        },
      });
    expect(vsRes).toHaveStatus(201);

    const expandRes = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(vsUrl)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(expandRes).toHaveStatus(200);
    expect(expandRes.body.expansion.contains).toHaveLength(1);
    expect(expandRes.body.expansion.contains[0].code).toBe('A');
    expect(expandRes.body.expansion.contains[0].display).toBe('Concept A');
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
    expect(res1).toHaveStatus(201);

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
    expect(res2).toHaveStatus(201);

    const res3 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(res2.body.url)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3).toHaveStatus(400);
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
      expect(csRes).toHaveStatus(201);

      const vsRes1 = await request(app)
        .post(`/fhir/R4/ValueSet`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(isaValueSet);
      expect(vsRes1).toHaveStatus(201);

      const vsRes2 = await request(app)
        .post(`/fhir/R4/ValueSet`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(descendentValueSet);
      expect(vsRes2).toHaveStatus(201);
    });

    test('Includes ancestor code in is-a filter', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${isaValueSet.url}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toContainExactly([
        { system, code: 'PAR', display: 'parent' },
        { system, code: 'CHD', display: 'child' },
        { system, code: 'PET', display: 'pet' },
      ]);
    });

    test('Text filter with is-a', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${isaValueSet.url}&filter=chi`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toContainExactly([{ system, code: 'CHD', display: 'child' }]);
    });

    test('Excludes ancestor code in descendent-of filter', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${descendentValueSet.url}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
        { system, code: 'PET', display: 'pet' },
      ]);
    });

    test('Text filter with descendent-of', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${descendentValueSet.url}&filter=pet`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toContainExactly([{ system, code: 'PET', display: 'pet' }]);
    });
  });

  describe('Code prefix filter', () => {
    // Flat CodeSystem for prefix/exact/escaping tests. Displays are deliberately Greek letters so
    // they never contain the code-shaped filter strings — this isolates the code-matching branch
    // from the display ILIKE branch.
    const flatCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      concept: [
        { code: 'HT', display: 'Alpha' },
        { code: 'HTX', display: 'Beta' },
        { code: 'HTXY', display: 'Gamma' },
        { code: 'A_B', display: 'Delta' },
        { code: 'AXB', display: 'Epsilon' },
      ],
    };
    const flatValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'active',
      compose: { include: [{ system: flatCodeSystem.url }] },
    };

    // Hierarchical CodeSystem for prefix-with-hierarchy tests. Codes share the 'MED' prefix so a
    // prefix filter is meaningful; displays again avoid the filter substrings.
    const hierarchyCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      hierarchyMeaning: 'is-a',
      concept: [
        {
          code: 'MED',
          display: 'Alpha',
          concept: [
            { code: 'MED100', display: 'Beta' },
            { code: 'MED200', display: 'Gamma' },
          ],
        },
      ],
    };

    const isaValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'active',
      compose: {
        include: [{ system: hierarchyCodeSystem.url, filter: [{ property: 'code', op: 'is-a', value: 'MED' }] }],
      },
    };
    const descendentValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'active',
      compose: {
        include: [
          { system: hierarchyCodeSystem.url, filter: [{ property: 'code', op: 'descendent-of', value: 'MED' }] },
        ],
      },
    };

    // CodeSystem with a synonym (designation) to exercise the canonical-only code branch. The code
    // 'SYN100' matches a 'SYN' prefix; its synonym display 'Zeta' is code-shaped-free so it only ever
    // matches the display branch — never the code branch.
    const synonymCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      concept: [{ code: 'SYN100', display: 'Alpha', designation: [{ value: 'Zeta' }] }],
    };
    const synonymValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'active',
      compose: { include: [{ system: synonymCodeSystem.url }] },
    };

    // CodeSystem whose codes all share the 'ORD' prefix and whose displays are code-shaped-free, so a
    // filter of 'ORD' matches every code by prefix while every row ties on display similarity (0) and
    // none is an exact code match. With no discriminating sort key, the result order is arbitrary; this
    // system exists to prove the deterministic code tiebreaker. Codes are inserted out of order so a
    // pass-through of physical/insertion order would NOT be code-ascending.
    const orderingCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      concept: [
        { code: 'ORD30', display: 'Alpha' },
        { code: 'ORD10', display: 'Beta' },
        { code: 'ORD50', display: 'Gamma' },
        { code: 'ORD20', display: 'Delta' },
        { code: 'ORD40', display: 'Epsilon' },
      ],
    };
    const orderingValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'active',
      compose: { include: [{ system: orderingCodeSystem.url }] },
    };

    const translatedCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      concept: [
        { code: 'LNG100', display: 'Alpha', designation: [{ language: 'fr', value: 'Oméga' }] },
        { code: 'LNG200', display: 'Beta' },
      ],
    };
    const translatedValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'active',
      compose: { include: [{ system: translatedCodeSystem.url }] },
    };

    beforeAll(async () => {
      for (const resource of [
        flatCodeSystem,
        hierarchyCodeSystem,
        synonymCodeSystem,
        orderingCodeSystem,
        translatedCodeSystem,
        flatValueSet,
        isaValueSet,
        descendentValueSet,
        synonymValueSet,
        orderingValueSet,
        translatedValueSet,
      ]) {
        const res = await request(app)
          .post(`/fhir/R4/${resource.resourceType}`)
          .set('Authorization', 'Bearer ' + accessToken)
          .set('Content-Type', ContentType.FHIR_JSON)
          .send(resource);
        expect(res).toHaveStatus(201);
      }
    });

    test.each([
      {
        name: 'Prefix match on code (>= 3 chars)',
        valueSet: flatValueSet.url,
        system: flatCodeSystem.url,
        filter: 'HTX',
        expected: [
          { code: 'HTX', display: 'Beta' },
          { code: 'HTXY', display: 'Gamma' },
        ],
      },
      {
        name: 'Prefix match on code is case-insensitive',
        valueSet: flatValueSet.url,
        system: flatCodeSystem.url,
        filter: 'htx',
        expected: [
          { code: 'HTX', display: 'Beta' },
          { code: 'HTXY', display: 'Gamma' },
        ],
      },
      {
        // Only the exact code 'HT' — the prefix siblings HTX/HTXY must NOT be returned below 3 chars.
        name: 'Short filter (< 3 chars) falls back to exact code match',
        valueSet: flatValueSet.url,
        system: flatCodeSystem.url,
        filter: 'HT',
        expected: [{ code: 'HT', display: 'Alpha' }],
      },
      {
        // The underscore must be treated literally, so 'AXB' (which would match if '_' were a
        // wildcard) is excluded.
        name: 'Escapes LIKE wildcards in code prefix filter',
        valueSet: flatValueSet.url,
        system: flatCodeSystem.url,
        filter: 'A_B',
        expected: [{ code: 'A_B', display: 'Delta' }],
      },
      {
        name: 'Code prefix with is-a includes ancestor and matching descendants',
        valueSet: isaValueSet.url,
        system: hierarchyCodeSystem.url,
        filter: 'med',
        expected: [
          { code: 'MED', display: 'Alpha' },
          { code: 'MED100', display: 'Beta' },
          { code: 'MED200', display: 'Gamma' },
        ],
      },
      {
        name: 'Code prefix narrows an is-a hierarchy expansion',
        valueSet: isaValueSet.url,
        system: hierarchyCodeSystem.url,
        filter: 'med2',
        expected: [{ code: 'MED200', display: 'Gamma' }],
      },
      {
        // 'MED' matches the prefix but must be excluded because descendent-of is strict.
        name: 'Code prefix with descendent-of excludes the ancestor',
        valueSet: descendentValueSet.url,
        system: hierarchyCodeSystem.url,
        filter: 'med',
        expected: [
          { code: 'MED100', display: 'Beta' },
          { code: 'MED200', display: 'Gamma' },
        ],
      },
      {
        name: 'Code prefix branch matches the concept once',
        valueSet: synonymValueSet.url,
        system: synonymCodeSystem.url,
        filter: 'SYN',
        expected: [{ code: 'SYN100', display: 'Alpha' }],
      },
      {
        // The display branch searches every display the concept has, and the semi-join collapses the match
        // back onto the canonical row — so the code is found by its synonym but shown with its own display.
        name: 'Display branch matches a synonym and returns the canonical display',
        valueSet: synonymValueSet.url,
        system: synonymCodeSystem.url,
        filter: 'zeta',
        expected: [{ code: 'SYN100', display: 'Alpha' }],
      },
    ])('$name', async ({ valueSet, system, filter, expected }) => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${valueSet}&filter=${encodeURIComponent(filter)}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      expect(res.body.expansion).toMatchObject<Partial<ValueSetExpansion>>({
        contains: expected.map((coding) => ({ system, ...coding })),
      });
    });

    test('Code prefix filter is unscoped by displayLanguage', async () => {
      // Both codes match the prefix; the one with a French designation is shown in French, and the one
      // without keeps its base display rather than dropping out of the expansion.
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${translatedValueSet.url}&filter=LNG&displayLanguage=fr`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system: translatedCodeSystem.url, code: 'LNG100', display: 'Oméga' },
        { system: translatedCodeSystem.url, code: 'LNG200', display: 'Beta' },
      ] satisfies ValueSetExpansionContains[]);
    });

    test('Exact code match ranks ahead of longer prefix match', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${flatValueSet.url}&filter=HTX`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      const contains = (res.body.expansion as ValueSetExpansion).contains as ValueSetExpansionContains[];
      const codes = contains.map((c) => c.code);
      expect(codes.indexOf('HTX')).toBeGreaterThanOrEqual(0);
      expect(codes.indexOf('HTX')).toBeLessThan(codes.indexOf('HTXY'));
    });

    test('Sort order is deterministic when rows tie on relevance', async () => {
      // Every 'ORD' code ties on the relevance keys (no exact match, display similarity 0), so only a
      // stable tiebreaker can pin the order. Expect ascending code order, and identical order across
      // repeated requests.
      const expectedCodes = ['ORD10', 'ORD20', 'ORD30', 'ORD40', 'ORD50'];
      const fetchCodes = async (): Promise<(string | undefined)[]> => {
        const res = await request(app)
          .get(`/fhir/R4/ValueSet/$expand?url=${orderingValueSet.url}&filter=ORD`)
          .set('Authorization', 'Bearer ' + accessToken);
        expect(res).toHaveStatus(200);
        return (res.body.expansion.contains as ValueSetExpansionContains[]).map((c) => c.code);
      };
      expect(await fetchCodes()).toStrictEqual(expectedCodes);
      // Stable across repeated identical queries.
      expect(await fetchCodes()).toStrictEqual(expectedCodes);
    });

    test('Pagination is stable across offset windows', async () => {
      // A deterministic sort is what makes offset-based paging safe: consecutive windows must partition
      // the full result with no skipped or duplicated codes.
      const page = async (offset: number, count: number): Promise<(string | undefined)[]> => {
        const res = await request(app)
          .get(`/fhir/R4/ValueSet/$expand?url=${orderingValueSet.url}&filter=ORD&offset=${offset}&count=${count}`)
          .set('Authorization', 'Bearer ' + accessToken);
        expect(res).toHaveStatus(200);
        return (res.body.expansion.contains as ValueSetExpansionContains[]).map((c) => c.code);
      };
      const paged = [...(await page(0, 2)), ...(await page(2, 2)), ...(await page(4, 2))];
      expect(paged).toStrictEqual(['ORD10', 'ORD20', 'ORD30', 'ORD40', 'ORD50']);
    });
  });

  describe('Diacritic and Unicode normalization handling in filter', () => {
    // Displays carry French diacritics so accent- and normalization-insensitive matching can be
    // exercised end-to-end through the ILIKE-based text filter.
    const diacriticCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      concept: [
        { code: 'FR100', display: 'Système' },
        { code: 'FR200', display: 'Artère' },
        { code: 'FR300', display: 'Élevé' },
        // Ranking pair for filter "debit": the accented display is the better match, but trigram
        // similarity scores it well below the unaccented one unless both sides are folded first
        { code: 'FR400', display: 'Débit' },
        { code: 'FR500', display: 'debits' },
      ],
    };
    const diacriticValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'active',
      compose: { include: [{ system: diacriticCodeSystem.url }] },
    };
    // Enumerating concepts explicitly routes the filter through the in-memory match path rather than
    // the database predicate, so both paths fold text the same way
    const enumeratedValueSet: ValueSet = {
      resourceType: 'ValueSet',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      status: 'active',
      compose: {
        include: [
          {
            system: diacriticCodeSystem.url,
            concept: [
              { code: 'FR100', display: 'Système' },
              { code: 'FR200', display: 'Artère' },
              { code: 'FR300', display: 'Élevé' },
            ],
          },
        ],
      },
    };

    beforeAll(async () => {
      for (const resource of [diacriticCodeSystem, diacriticValueSet, enumeratedValueSet]) {
        const res = await request(app)
          .post(`/fhir/R4/${resource.resourceType}`)
          .set('Authorization', 'Bearer ' + accessToken)
          .set('Content-Type', ContentType.FHIR_JSON)
          .send(resource);
        expect(res).toHaveStatus(201);
      }
    });

    test('Filter without accents matches display containing accented characters', async () => {
      // A francophone user typing quickly commonly drops diacritics ("systeme" for "Système").
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${diacriticValueSet.url}&filter=systeme`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toStrictEqual<ValueSetExpansionContains[]>([
        { system: diacriticCodeSystem.url, code: 'FR100', display: 'Système' },
      ]);
    });

    test('Filter in NFD normalization form matches display stored in NFC form', async () => {
      // Some input methods/browsers emit decomposed Unicode (base letter + combining accent) rather
      // than the precomposed form the CodeSystem is stored in; both must resolve to the same match.
      const decomposedFilter = 'levé'.normalize('NFD');
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${diacriticValueSet.url}&filter=${encodeURIComponent(decomposedFilter)}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toStrictEqual<ValueSetExpansionContains[]>([
        { system: diacriticCodeSystem.url, code: 'FR300', display: 'Élevé' },
      ]);
    });

    test('Unaccented filter ranks the closest accented display first', async () => {
      // Trigram similarity against raw text penalizes accented characters, so an accented display that
      // matches the filter exactly once folded loses to a worse unaccented match. Ranking has to fold too.
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${diacriticValueSet.url}&filter=debit`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toStrictEqual<ValueSetExpansionContains[]>([
        { system: diacriticCodeSystem.url, code: 'FR400', display: 'Débit' },
        { system: diacriticCodeSystem.url, code: 'FR500', display: 'debits' },
      ]);
    });

    test('Unaccented filter matches accented display in an enumerated ValueSet', async () => {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${enumeratedValueSet.url}&filter=systeme`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toStrictEqual<ValueSetExpansionContains[]>([
        { system: diacriticCodeSystem.url, code: 'FR100', display: 'Système' },
      ]);
    });

    test('NFD filter matches NFC display in an enumerated ValueSet', async () => {
      const res = await request(app)
        .get(
          `/fhir/R4/ValueSet/$expand?url=${enumeratedValueSet.url}&filter=${encodeURIComponent('levé'.normalize('NFD'))}`
        )
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toStrictEqual<ValueSetExpansionContains[]>([
        { system: diacriticCodeSystem.url, code: 'FR300', display: 'Élevé' },
      ]);
    });
  });

  describe('Cost-based parent-filter strategy', () => {
    const system = 'http://example.com/CodeSystem/' + randomUUID();
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'example',
      url: system,
      hierarchyMeaning: 'is-a',
      concept: [
        {
          code: 'PAR',
          display: 'parent alpha',
          designation: [{ language: 'fr', value: 'parent alpha (fr)' }],
          concept: [
            { code: 'CHD', display: 'child alpha', designation: [{ language: 'fr', value: 'child alpha (fr)' }] },
            { code: 'PET', display: 'pet beta', designation: [{ language: 'fr', value: 'pet beta (fr)' }] },
          ],
        },
      ],
    };

    let stored: WithId<CodeSystem>;
    let db: PgQueryable;

    beforeAll(async () => {
      const res = await request(app)
        .post(`/fhir/R4/CodeSystem`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(codeSystem);
      expect(res).toHaveStatus(201);
      stored = res.body as WithId<CodeSystem>;

      await withTestContext(async () => {
        const { repo } = await createTestProject({ withRepo: true });
        db = repo.getDatabaseClient(repoAccess.sqlRead('CodeSystem', { source: 'test' }));
        await hydrateCodeSystemProperties(db, stored);
      });
    });

    test('countCandidatesBounded returns min(actual, limit)', async () => {
      // 'alpha' matches PAR + CHD (2). PET does not.
      expect(await countCandidatesBounded(db, stored, 'alpha', 10)).toBe(2);
      expect(await countCandidatesBounded(db, stored, 'alpha', 1)).toBe(1); // bounded
      expect(await countCandidatesBounded(db, stored, 'zzz', 10)).toBe(0);
    });

    test('countCandidatesBounded counts concepts, not matching rows', async () => {
      // 'alpha' matches four rows — the canonical displays of PAR and CHD plus both French designations —
      // but only two concepts. CANDIDATE_THRESHOLD is expressed in codes, so the count must be too.
      expect(await countCandidatesBounded(db, stored, 'alpha', 10)).toBe(2);
      // 'beta' matches PET's canonical display and its French designation: one concept.
      expect(await countCandidatesBounded(db, stored, 'beta', 10)).toBe(1);
    });

    test('descendant and ancestor strategies return identical members', async () => {
      const include = { system, filter: [{ property: 'concept', op: 'is-a' as const, value: 'PAR' }] };
      const params = { filter: 'alpha' };

      const ancestorQuery = expansionQuery(include, stored, params, 'ancestor');
      const descendantQuery = expansionQuery(include, stored, params, 'descendant');
      if (!ancestorQuery || !descendantQuery) {
        throw new Error('expected both strategies to build a query');
      }
      const ancestorRows = await ancestorQuery.execute(db);
      const descendantRows = await descendantQuery.execute(db);

      const codes = (rows: { code: string }[]): string[] => rows.map((r) => r.code).sort();
      expect(codes(ancestorRows)).toEqual(['CHD', 'PAR']);
      expect(codes(descendantRows)).toEqual(codes(ancestorRows));
    });

    test('descendant and ancestor strategies agree with displayLanguage', async () => {
      const include = { system, filter: [{ property: 'concept', op: 'is-a' as const, value: 'PAR' }] };
      const params = { filter: 'alpha', displayLanguage: 'fr' };

      const ancestorQuery = expansionQuery(include, stored, params, 'ancestor');
      const descendantQuery = expansionQuery(include, stored, params, 'descendant');
      if (!ancestorQuery || !descendantQuery) {
        throw new Error('expected both strategies to build a query');
      }
      const ancestorRows = await ancestorQuery.execute(db);
      const descendantRows = await descendantQuery.execute(db);

      const ancestorCodes = ancestorRows.map((r) => r.code).sort();
      const descendantCodes = descendantRows.map((r) => r.code).sort();
      expect(ancestorCodes).toEqual(['CHD', 'PAR']);
      expect(descendantCodes).toEqual(ancestorCodes);
      // displayLanguage is a display preference resolved after the window, so neither strategy's driving
      // query returns designation rows: exactly one row per concept, and no `language` column at all.
      expect(ancestorRows).toHaveLength(2);
      expect(descendantRows).toHaveLength(2);
      expect(ancestorRows.every((r) => !('language' in r))).toBe(true);
      expect(descendantRows.every((r) => !('language' in r))).toBe(true);
    });
  });

  describe('Display language with ValueSet filters', () => {
    const system = 'http://example.com/CodeSystem/' + randomUUID();
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: system,
      hierarchyMeaning: 'is-a',
      property: [
        { code: 'status', type: 'code' },
        { code: 'notSelectable', uri: abstractProperty, type: 'boolean' },
      ],
      concept: [
        {
          code: 'ANML',
          display: 'Animal',
          designation: [{ language: 'fr', value: 'Animal (fr)' }],
          property: [{ code: 'notSelectable', valueBoolean: true }],
          concept: [
            {
              code: 'DOG',
              display: 'Dog',
              designation: [{ language: 'fr', value: 'Chien' }],
              property: [{ code: 'status', valueCode: 'active' }],
            },
            {
              code: 'CAT',
              display: 'Cat',
              designation: [{ language: 'fr', value: 'Chat' }],
              property: [{ code: 'status', valueCode: 'retired' }],
            },
            { code: 'FSH', display: 'Fish', property: [{ code: 'status', valueCode: 'active' }] },
          ],
        },
      ],
    };

    const valueSets: ValueSet[] = [];
    function valueSetWithFilter(filter: ValueSetComposeIncludeFilter): ValueSet {
      const valueSet: ValueSet = {
        resourceType: 'ValueSet',
        status: 'active',
        url: 'http://example.com/ValueSet/' + randomUUID(),
        compose: { include: [{ system, filter: [filter] }] },
      };
      valueSets.push(valueSet);
      return valueSet;
    }
    const statusActive = valueSetWithFilter({ property: 'status', op: '=', value: 'active' });
    const statusInSet = valueSetWithFilter({ property: 'status', op: 'in', value: 'active,retired' });
    const statusExists = valueSetWithFilter({ property: 'status', op: 'exists', value: 'true' });
    const statusMissing = valueSetWithFilter({ property: 'status', op: 'exists', value: 'false' });
    const isaAnimal = valueSetWithFilter({ property: 'concept', op: 'is-a', value: 'ANML' });
    const belowAnimal = valueSetWithFilter({ property: 'concept', op: 'descendent-of', value: 'ANML' });

    async function expand(valueSet: ValueSet, query = ''): Promise<ValueSetExpansionContains[]> {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}${query}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      return (res.body.expansion as ValueSetExpansion).contains ?? [];
    }

    beforeAll(async () => {
      for (const resource of [codeSystem, ...valueSets]) {
        const res = await request(app)
          .post(`/fhir/R4/${resource.resourceType}`)
          .set('Authorization', 'Bearer ' + accessToken)
          .set('Content-Type', ContentType.FHIR_JSON)
          .send(resource);
        expect(res).toHaveStatus(201);
      }
    });

    // FSH has no French designation. It stays in every expansion below and falls back to its base display:
    // displayLanguage is a display preference, so it never changes which codes are members.
    test.each([
      {
        name: 'Property = filter',
        valueSet: statusActive,
        filter: '',
        expected: [
          { code: 'DOG', display: 'Chien' },
          { code: 'FSH', display: 'Fish' },
        ],
      },
      {
        name: 'Property = filter with text filter',
        valueSet: statusActive,
        filter: 'chi',
        expected: [{ code: 'DOG', display: 'Chien' }],
      },
      {
        name: 'Property in filter',
        valueSet: statusInSet,
        filter: '',
        expected: [
          { code: 'DOG', display: 'Chien' },
          { code: 'CAT', display: 'Chat' },
          { code: 'FSH', display: 'Fish' },
        ],
      },
      {
        name: 'Property in filter with text filter',
        valueSet: statusInSet,
        filter: 'cha',
        expected: [{ code: 'CAT', display: 'Chat' }],
      },
      {
        name: 'Property exists=true filter',
        valueSet: statusExists,
        filter: '',
        expected: [
          { code: 'DOG', display: 'Chien' },
          { code: 'CAT', display: 'Chat' },
          { code: 'FSH', display: 'Fish' },
        ],
      },
      {
        name: 'Property exists=true filter with text filter',
        valueSet: statusExists,
        filter: 'chi',
        expected: [{ code: 'DOG', display: 'Chien' }],
      },
      {
        // Only ANML lacks a `status` property
        name: 'Property exists=false filter',
        valueSet: statusMissing,
        filter: '',
        expected: [{ code: 'ANML', display: 'Animal (fr)' }],
      },
      {
        name: 'Property exists=false filter with text filter',
        valueSet: statusMissing,
        filter: 'ani',
        expected: [{ code: 'ANML', display: 'Animal (fr)' }],
      },
      {
        name: 'is-a filter',
        valueSet: isaAnimal,
        filter: '',
        expected: [
          { code: 'ANML', display: 'Animal (fr)' },
          { code: 'DOG', display: 'Chien' },
          { code: 'CAT', display: 'Chat' },
          { code: 'FSH', display: 'Fish' },
        ],
      },
      {
        name: 'is-a filter with text filter',
        valueSet: isaAnimal,
        filter: 'chi',
        expected: [{ code: 'DOG', display: 'Chien' }],
      },
      {
        name: 'descendent-of filter',
        valueSet: belowAnimal,
        filter: '',
        expected: [
          { code: 'DOG', display: 'Chien' },
          { code: 'CAT', display: 'Chat' },
          { code: 'FSH', display: 'Fish' },
        ],
      },
      {
        name: 'descendent-of filter with text filter',
        valueSet: belowAnimal,
        filter: 'cha',
        expected: [{ code: 'CAT', display: 'Chat' }],
      },
    ])('$name returns translated displays', async ({ valueSet, filter, expected }) => {
      const query = `&displayLanguage=fr${filter ? `&filter=${filter}` : ''}`;
      expect(await expand(valueSet, query)).toContainExactly(expected.map((coding) => ({ system, ...coding })));
    });

    test('excludeNotForUI excludes translations of abstract concepts', async () => {
      // Only ANML is abstract; FSH is selectable and keeps its base display for want of a translation
      expect(await expand(isaAnimal, '&displayLanguage=fr&excludeNotForUI=true')).toContainExactly([
        { system, code: 'DOG', display: 'Chien' },
        { system, code: 'CAT', display: 'Chat' },
        { system, code: 'FSH', display: 'Fish' },
      ]);
    });

    test('includeDesignations and displayLanguage both apply to one request', async () => {
      // These were mutually exclusive while the two were a single if/else on the `language` column
      expect(await expand(isaAnimal, '&displayLanguage=fr&includeDesignations=true')).toContainExactly([
        { system, code: 'ANML', display: 'Animal (fr)', designation: [{ language: 'fr', value: 'Animal (fr)' }] },
        { system, code: 'DOG', display: 'Chien', designation: [{ language: 'fr', value: 'Chien' }] },
        { system, code: 'CAT', display: 'Chat', designation: [{ language: 'fr', value: 'Chat' }] },
        { system, code: 'FSH', display: 'Fish' },
      ]);
    });

    test('includeDesignations returns designations for hierarchy filters', async () => {
      const contains = await expand(isaAnimal, '&includeDesignations=true');
      expect(contains.map((c) => c.code).sort()).toStrictEqual(['ANML', 'CAT', 'DOG', 'FSH']);
      expect(contains).toContainExactly([
        { system, code: 'ANML', display: 'Animal', designation: [{ language: 'fr', value: 'Animal (fr)' }] },
        { system, code: 'DOG', display: 'Dog', designation: [{ language: 'fr', value: 'Chien' }] },
        { system, code: 'CAT', display: 'Cat', designation: [{ language: 'fr', value: 'Chat' }] },
        { system, code: 'FSH', display: 'Fish' },
      ]);
    });

    test('Designations survive pre-expansion round trip', async () => {
      const contains = await expand(isaAnimal, '&includeDesignations=true');
      const preExpanded: ValueSet = {
        resourceType: 'ValueSet',
        status: 'active',
        url: 'http://example.com/ValueSet/' + randomUUID(),
        compose: { include: [{ system }] },
        expansion: { timestamp: new Date().toISOString(), total: contains.length, contains },
      };
      const vsRes = await request(app)
        .post(`/fhir/R4/ValueSet`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(preExpanded);
      expect(vsRes).toHaveStatus(201);

      expect(await expand(preExpanded, '&displayLanguage=fr')).toContainExactly([
        { system, code: 'ANML', display: 'Animal (fr)' },
        { system, code: 'DOG', display: 'Chien' },
        { system, code: 'CAT', display: 'Chat' },
        { system, code: 'FSH', display: 'Fish' }, // No French designation: falls back to the base display
      ]);
    });

    test.each([
      { name: 'Property = filter', valueSet: statusActive, expected: ['DOG', 'FSH'] },
      { name: 'Property exists=false filter', valueSet: statusMissing, expected: ['ANML'] },
      { name: 'is-a filter', valueSet: isaAnimal, expected: ['ANML', 'CAT', 'DOG', 'FSH'] },
      { name: 'descendent-of filter', valueSet: belowAnimal, expected: ['CAT', 'DOG', 'FSH'] },
    ])('$name is unchanged without displayLanguage', async ({ valueSet, expected }) => {
      const contains = await expand(valueSet);
      expect(contains.map((c) => c.code).sort()).toStrictEqual(expected);
      // Base displays, not translations
      expect(contains.every((c) => !c.display?.includes('Ch'))).toBe(true);
    });
  });

  test('Recursive subsumption', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&count=200`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    const v2Codes = expansion.contains?.filter((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v2-0131');
    expect(v2Codes).toHaveLength(12);
    const v3Codes = expansion.contains?.filter((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v3-RoleCode');
    expect(v3Codes).toHaveLength(110);
    const abstractCode = expansion.contains?.find((c) => c.code === '_PersonalRelationshipRoleType');
    expect(abstractCode).toBeDefined();
  });

  test('Recursive subsumption with filter', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&filter=adopt&count=200`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    const expandedCodes = expansion.contains?.map((coding) => coding.code);
    expect(expandedCodes).toContainExactly(['ADOPTP', 'ADOPTF', 'ADOPTM', 'CHLDADOPT', 'DAUADOPT', 'SONADOPT']);
  });

  test('Filter out abstract codes', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&count=200&excludeNotForUI=true`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
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
    expect(res1).toHaveStatus(201);

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
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
    expect(res1).toHaveStatus(201);

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    const expansion = res2.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains?.[0]?.code).toStrictEqual('ERECCAP');
  });

  test('Property filter with exists=true', async () => {
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      status: 'active',
      url: 'https://example.com/fhir/ValueSet/property-filter' + randomUUID(),
      compose: {
        include: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
            filter: [{ property: 'status', op: 'exists', value: 'true' }],
          },
        ],
      },
    };
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(valueSet);
    expect(res1).toHaveStatus(201);

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${valueSet.url}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    const expansion = res2.body.expansion as ValueSetExpansion;
    // Only one code in the set has a `status` property
    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains?.[0]?.code).toStrictEqual('ERECCAP');
  });

  test('Property filter with exists=false', async () => {
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      status: 'active',
      url: 'https://example.com/fhir/ValueSet/property-filter' + randomUUID(),
      compose: {
        include: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
            filter: [{ property: 'status', op: 'exists', value: 'false' }],
          },
        ],
      },
    };
    const res1 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(valueSet);
    expect(res1).toHaveStatus(201);

    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${valueSet.url}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2).toHaveStatus(200);
    const expansion = res2.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toHaveLength(160);
    expect(expansion.contains?.find((c) => c.code === 'ERECCAP')).toBeUndefined();
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
    expect(valueSetRes).toHaveStatus(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&count=200`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
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
    expect(valueSetRes).toHaveStatus(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&count=200&filter=doggo`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
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
    expect(valueSetRes).toHaveStatus(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=a&count=200`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toBeUndefined();
  });

  test('Expand with empty filter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/task-status|4.0.1&filter=`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toHaveLength(12);
  });

  test('Expand with trailing quote', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/task-status|4.0.1&filter=a'`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toBeUndefined();
  });

  test('Exact code match', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=http://terminology.hl7.org/ValueSet/v3-RoleCode&filter=MT`)
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toContainExactly([
      {
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
        code: 'MT',
        display: 'Meat',
      },
    ]);
  });

  test('Exact code match with abstract filter', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=http://terminology.hl7.org/ValueSet/v3-RoleCode&filter=MT&excludeNotForUI=true`
      )
      .set('Authorization', 'Bearer ' + accessToken);

    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toContainExactly([
      {
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
        code: 'MT',
        display: 'Meat',
      },
    ]);
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
    expect(preexpandedRes).toHaveStatus(201);
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
    expect(valueSetRes).toHaveStatus(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=reported`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toContainExactly([
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
    ]);
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
    expect(csRes).toHaveStatus(201);
    const vsRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(valueSet);
    expect(vsRes).toHaveStatus(201);

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=hives`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    // The synonym is what the filter matched, but the concept is shown with its own display
    expect(expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'UTIC', display: 'Uticarial rash', system: codeSystem.url },
    ]);
  });

  test('Condenses multiple synonyms in expansion', async () => {
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      url: `urn:uuid:${randomUUID()}`,
      status: 'draft',
      content: 'example',
      name: 'Example allergy manifestations',
      property: [{ code: 'status', type: 'code' }],
      concept: [
        {
          code: 'HIV',
          display: 'Hives',
          designation: [{ value: 'Wheal' }, { language: 'fr', value: 'éruption urticaire' }],
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
    expect(csRes).toHaveStatus(201);
    const vsRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(valueSet);
    expect(vsRes).toHaveStatus(201);

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${valueSet.url}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    // 'Wheal' carries no language, but it is still a designation: it appears only when asked for
    expect(expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { system: codeSystem.url, code: 'HIV', display: 'Hives' },
    ]);
  });

  test('Property filter condenses synonyms the same way as an unfiltered include', async () => {
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      url: `urn:uuid:${randomUUID()}`,
      status: 'draft',
      content: 'example',
      property: [{ code: 'status', type: 'code' }],
      concept: [
        {
          code: 'HIV',
          display: 'Hives',
          designation: [{ value: 'Wheal' }, { language: 'fr', value: 'éruption urticaire' }],
          property: [{ code: 'status', valueCode: 'active' }],
        },
      ],
    };
    const unfiltered: ValueSet = {
      resourceType: 'ValueSet',
      status: 'draft',
      url: 'https://example.com/ValueSet/' + randomUUID(),
      compose: { include: [{ system: codeSystem.url }] },
    };
    const filtered: ValueSet = {
      resourceType: 'ValueSet',
      status: 'draft',
      url: 'https://example.com/ValueSet/' + randomUUID(),
      compose: {
        include: [{ system: codeSystem.url, filter: [{ property: 'status', op: '=', value: 'active' }] }],
      },
    };
    for (const resource of [codeSystem, unfiltered, filtered]) {
      const res = await request(app)
        .post(`/fhir/R4/${resource.resourceType}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .send(resource);
      expect(res).toHaveStatus(201);
    }

    async function expand(valueSet: ValueSet): Promise<ValueSetExpansionContains[] | undefined> {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${valueSet.url}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      return (res.body.expansion as ValueSetExpansion).contains;
    }

    const expected: ValueSetExpansionContains[] = [{ system: codeSystem.url, code: 'HIV', display: 'Hives' }];
    expect(await expand(unfiltered)).toStrictEqual(expected);
    expect(await expand(filtered)).toStrictEqual(expected);
  });

  describe('addExpansionItems()', () => {
    const system = 'http://example.com/codes/' + randomUUID();
    function testCodeSystem(language?: string): WithId<CodeSystem> {
      return {
        resourceType: 'CodeSystem',
        id: randomUUID(),
        status: 'draft',
        content: 'not-present',
        url: system,
        language,
      };
    }

    test('Builds one entry per row', () => {
      const expansion: ValueSetExpansionContains[] = [];
      const page = addExpansionItems(
        [
          { code: 'F', display: 'Food' },
          { code: 'D', display: null },
        ],
        expansion,
        testCodeSystem('en')
      );

      expect(expansion).toStrictEqual<ValueSetExpansionContains[]>([
        { system, code: 'F', display: 'Food' },
        { system, code: 'D', display: undefined },
      ]);
      // The returned page is what the designation resolver decorates
      expect(page).toStrictEqual(expansion);
    });

    test('Does not merge the same code from a different CodeSystem', () => {
      const otherSystem = 'http://example.com/codes/' + randomUUID();
      const expansion: ValueSetExpansionContains[] = [{ system: otherSystem, code: 'M', display: 'Married' }];

      addExpansionItems([{ code: 'M', display: 'Male' }], expansion, testCodeSystem());
      expect(expansion).toStrictEqual<ValueSetExpansionContains[]>([
        { system: otherSystem, code: 'M', display: 'Married' },
        { system, code: 'M', display: 'Male' },
      ]);
    });

    test('Keeps a code contributed by an earlier include only once', () => {
      const codeSystem = testCodeSystem('en');
      const expansion: ValueSetExpansionContains[] = [];

      addExpansionItems([{ code: 'DOG', display: 'Dog' }], expansion, codeSystem);
      const page = addExpansionItems([{ code: 'DOG', display: 'Dog' }], expansion, codeSystem);

      expect(expansion).toStrictEqual<ValueSetExpansionContains[]>([{ system, code: 'DOG', display: 'Dog' }]);
      // The second include still gets the entry back, so its designations are resolved onto it
      expect(page).toStrictEqual(expansion);
    });
  });

  test('Searches translated designations', async () => {
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      content: 'example',
      status: 'draft',
      concept: [
        {
          code: 'MSG_INVALID_ID',
          display: 'ID not accepted',
          designation: [
            { language: 'fr', value: 'ID non accepté' },
            { language: 'zh', value: 'ID不被接受' },
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
    expect(csRes).toHaveStatus(201);
    const vsRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(valueSet);
    expect(vsRes).toHaveStatus(201);

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=non&displayLanguage=fr`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'MSG_INVALID_ID', display: 'ID non accepté', system: codeSystem.url },
    ]);
  });

  test('Only returns one (default) matching translation', async () => {
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      content: 'example',
      status: 'draft',
      concept: [
        {
          code: 'MSG_INVALID_ID',
          display: 'ID not accepted',
          designation: [
            { language: 'fr', value: 'ID non accepté' },
            { language: 'zh', value: 'ID不被接受' },
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
    expect(csRes).toHaveStatus(201);
    const vsRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(valueSet);
    expect(vsRes).toHaveStatus(201);

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=accepted`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'MSG_INVALID_ID', display: 'ID not accepted', system: codeSystem.url },
    ]);
  });

  test('Short filter (< 3 chars) does not match display substrings', async () => {
    // Below 3 characters the display-substring branch is dropped (the trigram index can't serve a sub-trigram
    // substring), so a 2-char filter matches only exact codes, never display substrings.
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      content: 'complete',
      status: 'active',
      concept: [
        { code: 'HT', display: 'Alpha' },
        { code: 'HTX', display: 'Beta' }, // display contains 'et' but code does not
      ],
    };
    const valueSet: ValueSet = {
      resourceType: 'ValueSet',
      status: 'active',
      url: 'https://example.com/ValueSet/' + randomUUID(),
      compose: { include: [{ system: codeSystem.url }] },
    };
    expect(
      await request(app)
        .post('/fhir/R4/CodeSystem')
        .set('Authorization', 'Bearer ' + accessToken)
        .send(codeSystem)
    ).toHaveStatus(201);
    expect(
      await request(app)
        .post('/fhir/R4/ValueSet')
        .set('Authorization', 'Bearer ' + accessToken)
        .send(valueSet)
    ).toHaveStatus(201);

    // 'et' is a substring of display 'Beta' (code HTX) but of no code → no matches.
    const displayOnly = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=et`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(displayOnly).toHaveStatus(200);
    expect((displayOnly.body.expansion as ValueSetExpansion).contains ?? []).toHaveLength(0);

    // The exact 2-char code 'HT' still matches.
    const codeMatch = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&filter=HT`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(codeMatch).toHaveStatus(200);
    expect((codeMatch.body.expansion as ValueSetExpansion).contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'HT', display: 'Alpha', system: codeSystem.url },
    ]);
  });

  test('Honors ValueSet designation overrides', async () => {
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      content: 'example',
      status: 'draft',
      concept: [
        {
          code: 'MSG_INVALID_ID',
          display: 'ID not accepted',
          designation: [
            { language: 'fr', value: 'ID non accepté' },
            { language: 'zh', value: 'ID不被接受' },
          ],
        },
      ],
    };
    const valueSet = {
      resourceType: 'ValueSet',
      status: 'draft',
      url: 'https://example.com/ValueSet/' + randomUUID(),
      compose: {
        include: [
          {
            system: codeSystem.url,
            concept: [
              {
                code: 'MSG_INVALID_ID',
                display: 'Invalid ID',
                designation: [
                  { language: 'fr', value: 'Identifiant invalide' },
                  { language: 'es', value: 'ID inválido' },
                ],
              },
            ],
          },
        ],
      },
    } satisfies ValueSet;
    const csRes = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(codeSystem);
    expect(csRes).toHaveStatus(201);
    const vsRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(valueSet);
    expect(vsRes).toHaveStatus(201);

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url)}&filter=invalid&displayLanguage=fr`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'MSG_INVALID_ID', display: 'Identifiant invalide', system: codeSystem.url },
    ]);
  });

  test('Base resources are not shadowed for Super Admin', async () => {
    const url = 'https://medplum.com/fhir/ValueSet/resource-types';
    const csRes = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'CodeSystem',
        status: 'active',
        url,
        content: 'not-present',
      } satisfies CodeSystem);
    expect(csRes).toHaveStatus(201);

    const superAdminToken = await initTestAuth({ superAdmin: true });
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${url}&filter=clien`)
      .set('Authorization', 'Bearer ' + superAdminToken);
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains[0].display).toStrictEqual('ClientApplication');
  });

  describe('Pagination', () => {
    const systemA = 'http://example.com/CodeSystem/' + randomUUID();
    const systemB = 'http://example.com/CodeSystem/' + randomUUID();
    const designationSystem = 'http://example.com/CodeSystem/' + randomUUID();

    const codeSystemA: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: systemA,
      concept: [
        { code: 'A1', display: 'Alpha one' },
        { code: 'A2', display: 'Alpha two' },
        { code: 'A3', display: 'Alpha three' },
        { code: 'A4', display: 'Alpha four' },
      ],
    };
    const codeSystemB: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: systemB,
      concept: [
        { code: 'B1', display: 'Bravo one' },
        { code: 'B2', display: 'Bravo two' },
        { code: 'B3', display: 'Bravo three' },
        { code: 'B4', display: 'Bravo four' },
      ],
    };
    // D3 deliberately has no translations, to show how displayLanguage interacts with page membership
    const designationCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: designationSystem,
      concept: [
        {
          code: 'D1',
          display: 'Delta one',
          designation: [
            { language: 'fr', value: 'Delta un' },
            { language: 'de', value: 'Delta eins' },
          ],
        },
        {
          code: 'D2',
          display: 'Delta two',
          designation: [
            { language: 'fr', value: 'Delta deux' },
            { language: 'de', value: 'Delta zwei' },
          ],
        },
        { code: 'D3', display: 'Delta three' },
      ],
    };
    // Two designations per code in the same language: FHIR allows this (they are distinguished by
    // `designation.use`), and it is what makes a row-space page window straddle concept boundaries
    const multiDesignationSystem = 'http://example.com/CodeSystem/' + randomUUID();
    const multiDesignationCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: multiDesignationSystem,
      concept: ['un', 'deux', 'trois', 'quatre'].map((word, i) => ({
        code: `M${i + 1}`,
        display: `Mike ${i + 1}`,
        designation: [
          { language: 'fr', value: `Mike ${word}` },
          { language: 'fr', value: `Mike ${word} bis` },
        ],
      })),
    };
    // A CodeSystem declaring its own language, to show displayLanguage falling back rather than
    // matching `language = 'en'` against canonical rows, which carry no language at all
    const englishSystem = 'http://example.com/CodeSystem/' + randomUUID();
    const englishCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      language: 'en',
      url: englishSystem,
      concept: [
        { code: 'E1', display: 'Echo one' },
        { code: 'E2', display: 'Echo two' },
      ],
    };
    // Designation rows that carry no language: one written by an untagged `designation`, one by the
    // `#synonym` property path, which every CodeSystem using that property produces
    const synonymRowSystem = 'http://example.com/CodeSystem/' + randomUUID();
    const synonymRowCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'complete',
      url: synonymRowSystem,
      property: [{ code: 'SY', uri: 'http://hl7.org/fhir/concept-properties#synonym', type: 'string' }],
      concept: [
        {
          code: 'S1',
          display: 'Sierra one',
          designation: [{ value: 'Unlabelled one' }, { language: 'fr', value: 'Sierra un' }],
          property: [{ code: 'SY', valueString: 'Synonym one' }],
        },
        { code: 'S2', display: 'Sierra two' },
      ],
    };

    const allCodes = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'];

    function valueSet(compose: ValueSet['compose'], expansion?: ValueSetExpansion): ValueSet {
      return {
        resourceType: 'ValueSet',
        status: 'active',
        url: 'http://example.com/ValueSet/' + randomUUID(),
        compose,
        expansion,
      };
    }

    const singleSystemValueSet = valueSet({ include: [{ system: systemA }] });
    const twoSystemValueSet = valueSet({ include: [{ system: systemA }, { system: systemB }] });
    const onlyA = valueSet({ include: [{ system: systemA }] });
    const onlyB = valueSet({ include: [{ system: systemB }] });
    const nestedValueSet = valueSet({
      include: [{ valueSet: [onlyA.url as string] }, { valueSet: [onlyB.url as string] }],
    });
    const enumeratedValueSet = valueSet({
      include: [{ system: systemA, concept: codeSystemA.concept?.map((c) => ({ code: c.code, display: c.display })) }],
    });
    const preExpandedValueSet = valueSet({ include: [{ system: systemA }] }, {
      timestamp: new Date().toISOString(),
      contains: codeSystemA.concept?.map((c) => ({ system: systemA, code: c.code, display: c.display })),
    } satisfies ValueSetExpansion);
    const designationValueSet = valueSet({ include: [{ system: designationSystem }] });
    const multiDesignationValueSet = valueSet({ include: [{ system: multiDesignationSystem }] });
    const englishValueSet = valueSet({ include: [{ system: englishSystem }] });
    const synonymRowValueSet = valueSet({ include: [{ system: synonymRowSystem }] });

    let storedA: WithId<CodeSystem>;

    beforeAll(async () => {
      for (const resource of [
        codeSystemA,
        codeSystemB,
        designationCodeSystem,
        multiDesignationCodeSystem,
        englishCodeSystem,
        synonymRowCodeSystem,
        singleSystemValueSet,
        twoSystemValueSet,
        onlyA,
        onlyB,
        nestedValueSet,
        enumeratedValueSet,
        preExpandedValueSet,
        designationValueSet,
        multiDesignationValueSet,
        englishValueSet,
        synonymRowValueSet,
      ]) {
        const res = await request(app)
          .post(`/fhir/R4/${resource.resourceType}`)
          .set('Authorization', 'Bearer ' + accessToken)
          .set('Content-Type', ContentType.FHIR_JSON)
          .send(resource);
        expect(res).toHaveStatus(201);
        if (resource === codeSystemA) {
          storedA = res.body as WithId<CodeSystem>;
        }
      }
    });

    async function expand(vs: ValueSet, query = ''): Promise<ValueSetExpansion> {
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(vs.url as string)}${query}`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      return res.body.expansion as ValueSetExpansion;
    }

    async function pageCodes(vs: ValueSet, offset: number, count: number, query = ''): Promise<string[]> {
      const expansion = await expand(vs, `&offset=${offset}&count=${count}${query}`);
      return (expansion.contains ?? []).map((c) => c.code as string);
    }

    test('Windows over a single include partition the expansion', async () => {
      // Baseline: the one case pagination does handle correctly.
      const paged = [
        ...(await pageCodes(singleSystemValueSet, 0, 2)),
        ...(await pageCodes(singleSystemValueSet, 2, 2)),
      ];
      expect(paged.toSorted()).toStrictEqual(['A1', 'A2', 'A3', 'A4']);
    });

    test.fails('FAILING offset is applied to each compose.include separately', async () => {
      // `offset` is pushed into the per-include SQL query, so every include skips its own first N rows
      // instead of the offset being consumed across the concatenated expansion. Codes from every include
      // after the first are silently unreachable.
      const paged = [
        ...(await pageCodes(twoSystemValueSet, 0, 3)),
        ...(await pageCodes(twoSystemValueSet, 3, 3)),
        ...(await pageCodes(twoSystemValueSet, 6, 3)),
      ];
      expect(paged.toSorted()).toStrictEqual(allCodes);
    });

    test.fails('FAILING offset is applied to each nested include.valueSet separately', async () => {
      // Same defect through the `compose.include.valueSet` path: `computeExpansion` recurses with an
      // adjusted `count` but passes `offset` through unchanged to every nested ValueSet.
      const paged = [
        ...(await pageCodes(nestedValueSet, 0, 3)),
        ...(await pageCodes(nestedValueSet, 3, 3)),
        ...(await pageCodes(nestedValueSet, 6, 3)),
      ];
      expect(paged.toSorted()).toStrictEqual(allCodes);
    });

    test.fails('FAILING offset is ignored for an enumerated compose.include.concept', async () => {
      // The enumerated-concept path filters in memory and never consumes `offset`; `expandValueSet` only
      // ever slices [0, count), so every page returns the first page.
      expect(await pageCodes(enumeratedValueSet, 0, 2)).toStrictEqual(['A1', 'A2']);
      expect(await pageCodes(enumeratedValueSet, 2, 2)).toStrictEqual(['A3', 'A4']);
    });

    test.fails('FAILING offset is ignored for a pre-expanded ValueSet', async () => {
      // When `ValueSet.expansion.contains` is already complete, `computeExpansion` short-circuits to the
      // stored list and drops `offset` entirely.
      expect(await pageCodes(preExpandedValueSet, 0, 2)).toStrictEqual(['A1', 'A2']);
      expect(await pageCodes(preExpandedValueSet, 2, 2)).toStrictEqual(['A3', 'A4']);
    });

    test.fails('FAILING expansion.total reports the fetched page, not the size of the expansion', async () => {
      // The query fetches `count + 1` rows purely as a has-more probe, and `total` is set to however many
      // rows came back. A client cannot compute the number of pages, and `total` shifts as `offset` moves.
      const firstPage = await expand(singleSystemValueSet, '&offset=0&count=2');
      expect(firstPage.contains).toHaveLength(2);
      expect(firstPage.total).toBe(4);

      const lastPage = await expand(singleSystemValueSet, '&offset=2&count=2');
      expect(lastPage.contains).toHaveLength(2);
      expect(lastPage.total).toBe(4);
    });

    test.fails('FAILING expansion.total signals end-of-collection while later includes are unread', async () => {
      // The first include exactly fills the page, so the `count + 1` has-more probe finds nothing extra and
      // the loop breaks before reaching the second include. `total` equals `count`, which a paging client
      // reads as "no more results" even though every code in system B is still unread.
      const expansion = await expand(twoSystemValueSet, '&offset=0&count=4');
      expect(expansion.contains?.map((c) => c.code)).toStrictEqual(['A1', 'A2', 'A3', 'A4']);
      expect(expansion.total).toBeGreaterThan(4);
    });

    test.fails('FAILING count is exceeded when the page reaches MAX_EXPANSION_SIZE', async () => {
      // `expandValueSet` slices to MAX_EXPANSION_SIZE rather than `count` whenever the fetched rows reach
      // the cap, so a count just below the cap returns one more concept than was asked for.
      const largeValueSet = valueSet({ include: [{ system: 'http://dicom.nema.org/resources/ontology/DCM' }] });
      const res = await request(app)
        .post('/fhir/R4/ValueSet')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(largeValueSet);
      expect(res).toHaveStatus(201);

      const expansion = await expand(largeValueSet, '&count=999');
      expect(expansion.contains).toHaveLength(999);
    });

    test.fails('FAILING expansion.offset is not echoed back in the response', async () => {
      // ValueSet.expansion.offset is how a client knows which window it received.
      const expansion = await expand(singleSystemValueSet, '&offset=2&count=2');
      expect(expansion.offset).toBe(2);
    });

    test.fails('FAILING count=0 does not report the size of the expansion', async () => {
      // Per the $expand spec, count=0 asks for the size of the expansion with no codes returned.
      const expansion = await expand(singleSystemValueSet, '&count=0');
      expect(expansion.contains ?? []).toHaveLength(0);
      expect(expansion.total).toBe(4);
    });

    test.fails('FAILING count=0 is overridden by the typeahead default when a filter is present', async () => {
      // `if (params.filter && !params.count) params.count = 10` treats an explicit count=0 as unset.
      const expansion = await expand(singleSystemValueSet, '&count=0&filter=Alpha');
      expect(expansion.contains ?? []).toHaveLength(0);
    });

    test('count limits concepts, not rows, when designations are included', async () => {
      // The window is applied to canonical rows, which are one per concept, so designations cannot
      // consume slots in it.
      const expansion = await expand(designationValueSet, '&includeDesignations=true&count=2');
      expect((expansion.contains ?? []).map((c) => c.code)).toStrictEqual(['D1', 'D2']);
    });

    test('paging with designations partitions the concepts', async () => {
      const paged = [
        ...(await pageCodes(designationValueSet, 0, 2, '&includeDesignations=true')),
        ...(await pageCodes(designationValueSet, 2, 2, '&includeDesignations=true')),
        ...(await pageCodes(designationValueSet, 4, 2, '&includeDesignations=true')),
      ];
      expect(paged).toStrictEqual(['D1', 'D2', 'D3']);
    });

    test('displayLanguage keeps codes that have no translation', async () => {
      // displayLanguage is a display preference, not a membership filter: D3 has no French designation
      // and stays in the expansion with its base display.
      const expansion = await expand(designationValueSet, '&displayLanguage=fr&count=10');
      expect(expansion.contains).toContainExactly([
        { system: designationSystem, code: 'D1', display: 'Delta un' },
        { system: designationSystem, code: 'D2', display: 'Delta deux' },
        { system: designationSystem, code: 'D3', display: 'Delta three' },
      ]);
    });

    test('Paging a code with several designations in one language visits it once', async () => {
      // The reproduction from the plan: four codes, each with two `fr` designations, is 12 rows but
      // 4 concepts. A row-space window would emit every code after the first twice and report
      // `total === count` on page 0, stopping a paging client halfway.
      const firstPage = await expand(multiDesignationValueSet, '&displayLanguage=fr&offset=0&count=2');
      expect((firstPage.contains ?? []).map((c) => c.code)).toStrictEqual(['M1', 'M2']);
      expect(firstPage.total).toBeGreaterThan(2); // has-more probe counts concepts

      const paged = [
        ...(await pageCodes(multiDesignationValueSet, 0, 2, '&displayLanguage=fr')),
        ...(await pageCodes(multiDesignationValueSet, 2, 2, '&displayLanguage=fr')),
        ...(await pageCodes(multiDesignationValueSet, 4, 2, '&displayLanguage=fr')),
      ];
      expect(paged).toStrictEqual(['M1', 'M2', 'M3', 'M4']);
    });

    test('Several designations in one language resolve to a stable display', async () => {
      const displays = new Set<string | undefined>();
      for (let i = 0; i < 3; i++) {
        const expansion = await expand(multiDesignationValueSet, '&displayLanguage=fr&count=10');
        displays.add(expansion.contains?.find((c) => c.code === 'M1')?.display);
      }
      // Which of the two `fr` designations wins is arbitrary, but it must not vary between requests
      expect(displays.size).toBe(1);
      expect([...displays][0]).toMatch(/^Mike un/);
    });

    test('displayLanguage matching the CodeSystem language returns the full expansion', async () => {
      // Canonical rows carry no `language`, so scoping by `language = 'en'` used to match nothing at all
      const expansion = await expand(englishValueSet, '&displayLanguage=en&count=10');
      expect(expansion.contains).toContainExactly([
        { system: englishSystem, code: 'E1', display: 'Echo one' },
        { system: englishSystem, code: 'E2', display: 'Echo two' },
      ]);
    });

    test('Language-less designations and synonyms do not leak into the expansion', async () => {
      // Both a designation with no language and a `#synonym` property row are designation rows. Neither
      // may surface unasked, and neither may consume a slot in the page window.
      const expansion = await expand(synonymRowValueSet, '&count=10');
      expect(expansion.contains).toContainExactly([
        { system: synonymRowSystem, code: 'S1', display: 'Sierra one' },
        { system: synonymRowSystem, code: 'S2', display: 'Sierra two' },
      ]);

      // Every code is reachable with a window narrower than the row count
      const paged = [...(await pageCodes(synonymRowValueSet, 0, 1)), ...(await pageCodes(synonymRowValueSet, 1, 1))];
      expect(paged).toStrictEqual(['S1', 'S2']);

      // ...and they are all present when asked for
      const withDesignations = await expand(synonymRowValueSet, '&includeDesignations=true&count=10');
      expect(withDesignations.contains).toContainExactly([
        {
          system: synonymRowSystem,
          code: 'S1',
          display: 'Sierra one',
          designation: [{ value: 'Synonym one' }, { value: 'Unlabelled one' }, { language: 'fr', value: 'Sierra un' }],
        },
        { system: synonymRowSystem, code: 'S2', display: 'Sierra two' },
      ]);
    });

    test('A filter matches any display the concept has', async () => {
      // 'Sierra un' appears only in S1's French designation. The concept is a member on an unlocalized
      // request, shown in English — the filter searches every display, but does not localize the result.
      const french = await expand(synonymRowValueSet, '&filter=' + encodeURIComponent('Sierra un'));
      expect(french.contains).toContainExactly([{ system: synonymRowSystem, code: 'S1', display: 'Sierra one' }]);

      // A `#synonym` row's text is searchable for the same reason
      const synonym = await expand(synonymRowValueSet, '&filter=Synonym');
      expect(synonym.contains).toContainExactly([{ system: synonymRowSystem, code: 'S1', display: 'Sierra one' }]);
    });

    test('filter and displayLanguage together rank and display the translation', async () => {
      // Relevance is scored before LIMIT, so it must be scored against the text the client will see:
      // 'Mike deux' is an exact French display, 'Mike deux bis' only contains it.
      const expansion = await expand(multiDesignationValueSet, '&displayLanguage=fr&filter=Mike%20deux&count=10');
      const contains = expansion.contains ?? [];
      expect(contains[0]).toStrictEqual({ system: multiDesignationSystem, code: 'M2', display: 'Mike deux' });
      expect(contains.every((c) => c.display?.startsWith('Mike'))).toBe(true);
    });

    describe('Query shape', () => {
      function sqlFor(params: Parameters<typeof expansionQuery>[2]): string {
        const query = expansionQuery({ system: systemA }, storedA, params);
        const builder = new SqlBuilder();
        query?.buildSql(builder);
        return builder.toString();
      }

      test('Windows canonical rows in a deterministic order', () => {
        // Postgres makes no ordering guarantee without ORDER BY, and is free to choose a different plan
        // per OFFSET, so unfiltered paging could otherwise skip or repeat codes between windows.
        const sql = sqlFor({ offset: 2, count: 2 });
        expect(sql).toContain('"synonymOf" IS NULL');
        expect(sql).toContain('ORDER BY "Coding"."code"');
        expect(sql).toContain('LIMIT 3 OFFSET 2');
      });

      test('Joins the match set back onto canonical rows', () => {
        // The UNION collapses several matching designation rows for one code onto its canonical row, so the
        // window stays in concept space without a DISTINCT — and each branch keeps its own driving index.
        const sql = sqlFor({ filter: 'alpha' });
        expect(sql).toContain('COALESCE("display_match"."synonymOf", "display_match"."id") AS "id"');
        expect(sql).toContain(' UNION ');
        expect(sql).toContain('INNER JOIN (SELECT "matches"."id"');
        expect(sql).toMatch(/"T\d+"\."id" = "Coding"\."id"/);
        // Never OR-ed into the WHERE: that forces a scan of every row in the CodeSystem
        expect(sql).not.toContain('=ANY(');
        // The display match set is deliberately unscoped: a filter searches every display the concept has
        expect(sql).not.toContain('"display_match"."language"');
        expect(sql).not.toContain('"display_match"."synonymOf" IS');
      });

      test('Short filters match the code alone, with no join', () => {
        const sql = sqlFor({ filter: 'ab' });
        expect(sql).toContain('"Coding"."code" = ');
        expect(sql).not.toContain('JOIN');
      });

      test('Joins the ranking lateral only when filter and displayLanguage are both set', () => {
        expect(sqlFor({ filter: 'alpha', displayLanguage: 'fr' })).toContain('LEFT JOIN LATERAL');
        expect(sqlFor({ filter: 'alpha' })).not.toContain('LATERAL');
        expect(sqlFor({ displayLanguage: 'fr' })).not.toContain('LATERAL');
      });

      test('Keys the ranking lateral on (system, code), not synonymOf', () => {
        // Keying on `d."synonymOf" = <outer id>` has no supporting index and degenerates to a sequential
        // scan over Coding, once per outer row.
        const sql = sqlFor({ filter: 'alpha', displayLanguage: 'fr' });
        expect(sql).toContain('"translation"."code" = "Coding"."code"');
        expect(sql).not.toContain('"translation"."synonymOf"');
      });
    });
  });
});
