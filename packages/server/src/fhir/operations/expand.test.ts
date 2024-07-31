import { ContentType, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG, LOINC, SNOMED, createReference } from '@medplum/core';
import {
  CodeSystem,
  OperationOutcome,
  Project,
  ValueSet,
  ValueSetExpansion,
  ValueSetExpansionContains,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { createTestProject, initTestAuth, withTestContext } from '../../test.setup';

describe.each<Partial<Project>>([{ features: [] }, { features: ['terminology'] }])('Expand with %j', (projectProps) => {
  const app = express();
  let project: Project;
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const info = await createTestProject({ project: projectProps, withAccessToken: true });
    project = info.project;
    accessToken = info.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Using expected features', () => {
    if (projectProps.features === undefined) {
      fail('Expected projectProps.features to be defined');
    }
    for (const feature of projectProps.features) {
      expect(project.features).toContain(feature);
    }
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
    expect(res1.status).toEqual(201);

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
    expect(res1.status).toEqual(201);
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
    expect(res2.status).toEqual(200);

    // Second version of code system
    codeSystem.version = '2';
    const res3 = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .send(codeSystem);
    expect(res3.status).toEqual(201);
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
    expect(res4.status).toEqual(200);

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
    expect(res5.status).toEqual(201);
    const valueSet = res5.body as ValueSet;

    const res6 = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res6.status).toEqual(200);
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
    expect(res2.body.expansion.contains).toEqual(
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
    expect(res3.body.expansion.contains).toEqual(
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
});

describe('Updated implementation', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth({ project: { features: ['terminology'] } });
  });

  afterAll(async () => {
    await shutdownApp();
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
    expect(res2.status).toEqual(400);
  });

  test('Subsumption', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&count=200`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(
      expansion.contains?.find(
        (c) => c.system === 'http://terminology.hl7.org/CodeSystem/v3-RoleCode' && c.code === 'FRND'
      )?.display
    ).toEqual('unrelated friend');
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
    expect(res2.body.issue[0].details.text).toEqual(
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
    expect(res1.status).toEqual(201);

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
    expect(coding.display).toEqual('Test SNOMED override');
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
    expect(cs2.status).toEqual(201);

    const { project: p1, accessToken: a1 } = await createTestProject({ withAccessToken: true });
    const cs1 = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + a1)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...codeSystem, concept: [{ code: '1', display: 'Correct coding' }] });
    expect(cs1.status).toEqual(201);

    const { project: p3, accessToken: a3 } = await createTestProject({ withAccessToken: true });
    const cs3 = await request(app)
      .post(`/fhir/R4/CodeSystem`)
      .set('Authorization', 'Bearer ' + a3)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ ...codeSystem, concept: [{ code: '1', display: 'Another incorrect coding' }] });
    expect(cs3.status).toEqual(201);

    accessToken = await initTestAuth({
      project: {
        features: ['terminology'],
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
    expect(coding.display).toEqual('Correct coding');
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
    expect(res1.status).toEqual(201);

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

  test('Includes ancestor code in is-a filter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/care-team-category')}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains?.[0]).toEqual<ValueSetExpansionContains>({
      system: LOINC,
      code: 'LA28865-6',
      display: expect.stringMatching(/care team/i),
    });
  });

  test('Excludes ancestor code in descendent-of filter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/inactive')}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toHaveLength(11);
    expect(expansion.contains).not.toContainEqual<ValueSetExpansionContains>({
      code: '_ActMoodPredicate',
    });
  });

  test('Recursive subsumption', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&count=200`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toEqual(200);
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
    expect(res.status).toEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    const expandedCodes = expansion.contains?.map((coding) => coding.code);
    expect(expandedCodes).toHaveLength(6);
    expect(expandedCodes).toEqual(
      expect.arrayContaining(['ADOPTP', 'ADOPTF', 'ADOPTM', 'CHLDADOPT', 'DAUADOPT', 'SONADOPT'])
    );
  });

  test('Filter out abstract codes', async () => {
    const res = await request(app)
      .get(
        `/fhir/R4/ValueSet/$expand?url=${encodeURIComponent('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype')}&count=200&excludeNotForUI=true`
      )
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toEqual(200);
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
    expect(res2.status).toEqual(200);
    const expansion = res2.body.expansion as ValueSetExpansion;
    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains?.[0]?.code).toEqual('ERECCAP');
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
    expect(valueSetRes.status).toEqual(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&count=200`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toEqual(200);
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
    expect(filterCode?.display).toEqual('healthcare power of attorney');
    const explicitCode = expansion.contains?.find((c) => c.code === 'SEE');
    expect(explicitCode?.display).toEqual('Seeing');
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
    expect(valueSetRes.status).toEqual(201);
    const valueSet = valueSetRes.body as ValueSet;

    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(valueSet.url as string)}&count=200&filter=doggo`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toEqual(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toHaveLength(1);
    expect(expansion.contains?.[0]).toMatchObject({
      code: 'SEE',
      system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
      display: 'Seeing-eye doggo',
    });
  });
});
