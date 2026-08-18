// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, HTTP_HL7_ORG, HTTP_TERMINOLOGY_HL7_ORG, LOINC, SNOMED, createReference } from '@medplum/core';
import type {
  CodeSystem,
  OperationOutcome,
  Parameters,
  ParametersParameter,
  ValueSet,
  ValueSetComposeInclude,
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
import { addExpansionItems, countCandidatesBounded, expansionQuery, hydrateCodeSystemProperties } from './expand';

describe('Expand', () => {
  const app = express();
  let accessToken: string;

  async function postResource<T extends { resourceType: string }>(resource: T): Promise<T & { url: string }> {
    const res = await request(app)
      .post(`/fhir/R4/${resource.resourceType}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(resource);
    expect(res).toHaveStatus(201);
    return res.body;
  }

  function valueSet(...include: ValueSetComposeInclude[]): ValueSet {
    return {
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/ValueSet/' + randomUUID(),
      compose: { include },
    };
  }

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const info = await createTestProject({ withAccessToken: true });
    accessToken = info.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function expandUrl(url: string, query = ''): Promise<request.Response> {
    return request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(url)}${query ? '&' + query : ''}`)
      .set('Authorization', 'Bearer ' + accessToken);
  }

  async function expandInline(valueSet: ValueSet, query = ''): Promise<request.Response> {
    const parameter: ParametersParameter[] = [{ name: 'valueSet', resource: valueSet }];
    for (const [name, value] of new URLSearchParams(query)) {
      switch (name) {
        case 'count':
        case 'offset':
          parameter.push({ name, valueInteger: Number.parseInt(value, 10) });
          break;
        case 'excludeNotForUI':
        case 'includeDesignations':
          parameter.push({ name, valueBoolean: value === 'true' });
          break;
        case 'displayLanguage':
          parameter.push({ name, valueCode: value });
          break;
        default:
          parameter.push({ name, valueString: value });
      }
    }
    return request(app)
      .post('/fhir/R4/ValueSet/$expand')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Parameters', parameter } satisfies Parameters);
  }

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
    const res = await expandInline({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'https://example.com/ValueSet/' + randomUUID(),
    });
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
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/observation-codes', 'filter=rate');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains[0].system).toBe(LOINC);
    expect(res.body.expansion.contains[0].display).toMatch(/rate/i);
  });

  test('Success with count and offset', async () => {
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/observation-codes', 'filter=blood&offset=1&count=1');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains.length).toBe(1);
    expect(res.body.expansion.contains[0].system).toBe(LOINC);
    expect(res.body.expansion.contains[0].display).toMatch(/blood/i);
  });

  test('No duplicates', async () => {
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/subscription-status|4.0.1', 'filter=active');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toContainExactly([
      {
        system: 'http://hl7.org/fhir/subscription-status',
        code: 'active',
        display: 'Active',
      },
    ]);
  });

  test('Marital status', async () => {
    // This is a good test, because it covers a bunch of edge cases.
    // Marital status is the combination of two code systems: http://hl7.org/fhir/v3/MaritalStatus and http://hl7.org/fhir/v3/NullFlavor
    // For NullFlavor, it specifies a subset of codes
    // For MaritalStatus, it does not
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/marital-status', 'filter=married');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toContainEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
      code: 'M',
      display: 'Married',
    });
    expect(res.body.expansion.contains).toContainEqual({
      system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus',
      code: 'S',
      display: 'Never Married',
    });
  });

  test('Handle punctuation', async () => {
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/observation-codes', 'filter=intention - reported');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains[0].system).toBe(LOINC);
    expect(res.body.expansion.contains[0].display).toMatch(/pregnancy intention/i);
  });

  test('Handle empty string after punctuation', async () => {
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/care-plan-activity-kind', 'filter=[');
    expect(res).toHaveStatus(200);
  });

  test('No null `display` field', async () => {
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/care-plan-activity-kind');
    expect(res).toHaveStatus(200);

    const contains = res.body.expansion?.contains;
    expect(contains?.length).toBeGreaterThan(0);
    for (const code of contains as ValueSetExpansionContains[]) {
      if (code.display === null) {
        expect.fail(`Found null display value for coding ${code.system}|${code.code}`);
      }
    }
  });

  test('User uploaded ValueSet', async () => {
    const res2 = await expandInline(
      valueSet({
        system: 'http://hl7.org/fhir/resource-types',
        concept: [{ code: 'Patient' }, { code: 'Practitioner' }, { code: 'Observation' }],
      })
    );
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

    const res6 = await expandUrl(valueSet.url as string);
    expect(res6).toHaveStatus(200);
  });

  test('ValueSet that uses expansion instead of compose', async () => {
    const valueSet: ValueSet = {
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
    };

    const res2 = await expandInline(valueSet);
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
    const res3 = await expandInline(valueSet, 'filter=p');
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
    const url = 'https://example.com/fhir/ValueSet/recursive-' + randomUUID();
    const vs = await postResource({
      resourceType: 'ValueSet',
      status: 'active',
      url,
      compose: { include: [{ valueSet: [url] }] },
    });

    const res2 = await expandUrl(vs.url);
    expect(res2).toHaveStatus(400);
    expect(res2.body.issue?.[0]?.details?.text).toMatch(/recursive/i);
  });

  test('Subsumption', async () => {
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype', 'count=200');
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    const system = 'http://terminology.hl7.org/CodeSystem/v3-RoleCode';
    expect(expansion.contains?.find((c) => c.system === system && c.code === 'FRND')).toMatchObject({
      display: 'unrelated friend',
    });
  });

  test('Returns error when CodeSystem not found', async () => {
    const res2 = await expandInline(
      valueSet({
        system: 'http://example.com/the-codesystem-does-not-exist',
        concept: [{ code: '0' }],
      })
    );
    expect(res2).toHaveStatus(400);
    expect(res2.body.issue[0].details.text).toStrictEqual(
      'CodeSystem http://example.com/the-codesystem-does-not-exist not found'
    );
  });

  test('Prefers current Project version of common CodeSystem', async () => {
    await postResource({
      resourceType: 'CodeSystem',
      status: 'active',
      url: SNOMED,
      content: 'complete',
      concept: [{ code: '314159265', display: 'Test SNOMED override' }],
    });

    const vs = await postResource({
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

    const res = await expandUrl(vs.url);
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains[0]).toStrictEqual({
      system: SNOMED,
      code: '314159265',
      display: 'Test SNOMED override',
    });
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

    const newToken = await initTestAuth({
      project: {
        link: [{ project: createReference(p1) }, { project: createReference(p2) }, { project: createReference(p3) }],
      },
    });

    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet`)
      .set('Authorization', 'Bearer ' + newToken)
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
      .set('Authorization', 'Bearer ' + newToken);
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
    await postResource({
      resourceType: 'CodeSystem',
      status: 'active',
      url: csUrl,
      content: 'fragment',
      concept: [
        { code: 'A', display: 'Concept A' },
        { code: 'B', display: 'Concept B' },
      ],
    });

    const expandRes = await expandInline({
      resourceType: 'ValueSet',
      status: 'active',
      url: 'http://example.com/vs-fragment-' + randomUUID(),
      compose: {
        include: [{ system: csUrl, concept: [{ code: 'A', display: 'Concept A' }] }],
      },
    });
    expect(expandRes).toHaveStatus(200);
    expect(expandRes.body.expansion.contains).toContainExactly([{ system: csUrl, code: 'A', display: 'Concept A' }]);
  });

  test('Returns error when property filter is invalid for CodeSystem', async () => {
    await postResource({
      resourceType: 'CodeSystem',
      status: 'active',
      url: 'http://example.com/custom-code-system',
      content: 'complete',
      hierarchyMeaning: 'grouped-by',
      concept: [{ code: 'A', concept: [{ code: 'B' }] }],
    });

    const res3 = await expandInline(
      valueSet({
        system: 'http://example.com/custom-code-system',
        filter: [{ property: 'concept', op: 'is-a', value: 'A' }],
      })
    );
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
            { code: 'CHD', display: 'child' },
            { code: 'PET', display: 'pet' },
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
      await postResource(codeSystem);
    });

    test('Includes ancestor code in is-a filter', async () => {
      const res = await expandInline(isaValueSet);
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
      const res = await expandInline(isaValueSet, 'filter=chi');
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toContainExactly([{ system, code: 'CHD', display: 'child' }]);
    });

    test('Excludes ancestor code in descendent-of filter', async () => {
      const res = await expandInline(descendentValueSet);
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      const system = codeSystem.url;
      expect(expansion.contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
        { system, code: 'PET', display: 'pet' },
      ]);
    });

    test('Text filter with descendent-of', async () => {
      const res = await expandInline(descendentValueSet, 'filter=pet');
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

    beforeAll(async () => {
      for (const resource of [
        flatCodeSystem,
        hierarchyCodeSystem,
        synonymCodeSystem,
        orderingCodeSystem,
        flatValueSet,
        isaValueSet,
        descendentValueSet,
        synonymValueSet,
        orderingValueSet,
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
        // The code branch surfaces the canonical row only; synonyms share the canonical code and are
        // redundant there, so the synonym display 'Zeta' is not attached as a designation.
        name: 'Code prefix branch matches canonical rows only, not synonyms',
        valueSet: synonymValueSet.url,
        system: synonymCodeSystem.url,
        filter: 'SYN',
        expected: [{ code: 'SYN100', display: 'Alpha' }],
      },
      {
        // The display branch is unchanged (non-partial index), so a filter matching only the
        // synonym's display still finds the code.
        name: 'Display branch still matches synonym rows',
        valueSet: synonymValueSet.url,
        system: synonymCodeSystem.url,
        filter: 'zeta',
        expected: [{ code: 'SYN100', display: 'Zeta' }],
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
          concept: [
            { code: 'CHD', display: 'child alpha' },
            { code: 'PET', display: 'pet beta' },
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
  });

  test('Recursive subsumption', async () => {
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype', 'count=200');
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
    const res = await expandUrl(
      'http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype',
      'filter=adopt&count=200'
    );
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains?.map((c: ValueSetExpansionContains) => c.code)).toContainExactly([
      'ADOPTP',
      'ADOPTF',
      'ADOPTM',
      'CHLDADOPT',
      'DAUADOPT',
      'SONADOPT',
    ]);
  });

  test('Filter out abstract codes', async () => {
    const res = await expandUrl(
      'http://hl7.org/fhir/ValueSet/relatedperson-relationshiptype',
      'count=200&excludeNotForUI=true'
    );
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(
      expansion.contains?.filter((c) => c.system === 'http://terminology.hl7.org/CodeSystem/v3-RoleCode')
    ).toHaveLength(109);
    const abstractCode = expansion.contains?.find((c) => c.code === '_PersonalRelationshipRoleType');
    expect(abstractCode).toBeUndefined();
  });

  test('Property filter', async () => {
    const res = await expandInline(
      valueSet({
        system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
        filter: [{ property: 'status', op: '=', value: 'retired' }],
      })
    );
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toStrictEqual([expect.objectContaining({ code: 'ERECCAP' })]);
  });

  test('Property filter with multiple values', async () => {
    const res = await expandInline(
      valueSet({
        system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
        filter: [{ property: 'status', op: 'in', value: 'preferred,retired' }],
      })
    );
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toStrictEqual([expect.objectContaining({ code: 'ERECCAP' })]);
  });

  test('Property filter with exists=true', async () => {
    const res = await expandInline(
      valueSet({
        system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
        filter: [{ property: 'status', op: 'exists', value: 'true' }],
      })
    );
    expect(res).toHaveStatus(200);
    // Only one code in the set has a `status` property
    expect(res.body.expansion.contains).toStrictEqual([expect.objectContaining({ code: 'ERECCAP' })]);
  });

  test('Property filter with exists=false', async () => {
    const res = await expandInline(
      valueSet({
        system: 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm',
        filter: [{ property: 'status', op: 'exists', value: 'false' }],
      })
    );
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toHaveLength(160);
    expect(res.body.expansion.contains).not.toContainEqual(expect.objectContaining({ code: 'ERECCAP' }));
  });

  test('Reference to other ValueSet', async () => {
    const vs = await postResource(
      valueSet(
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
        }
      )
    );

    const res = await expandUrl(vs.url, 'count=200');
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
    const res = await expandInline(
      valueSet({
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
        concept: [{ code: 'SEE', display: 'Seeing-eye doggo' }],
      }),
      'count=200&filter=doggo'
    );
    expect(res).toHaveStatus(200);
    const expansion = res.body.expansion as ValueSetExpansion;

    expect(expansion.contains).toHaveLength(1);
    expect(res.body.expansion.contains).toStrictEqual([
      expect.objectContaining({
        code: 'SEE',
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
        display: 'Seeing-eye doggo',
      }),
    ]);
  });

  test('Minimum filter size for hierarchical expansion', async () => {
    const res = await expandInline(
      valueSet({
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
        filter: [
          {
            property: 'concept',
            op: 'is-a',
            value: '_PersonalRelationshipRoleType',
          },
        ],
      }),
      'filter=a&count=200'
    );
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toBeUndefined();
  });

  test('Expand with empty filter', async () => {
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/task-status|4.0.1', 'filter=');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toHaveLength(12);
  });

  test('Expand with trailing quote', async () => {
    const res = await expandUrl('http://hl7.org/fhir/ValueSet/task-status|4.0.1', `filter=a'`);
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toBeUndefined();
  });

  test('Exact code match', async () => {
    const res = await expandUrl('http://terminology.hl7.org/ValueSet/v3-RoleCode', 'filter=MT');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toContainExactly([
      {
        system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
        code: 'MT',
        display: 'Meat',
      },
    ]);
  });

  test('Exact code match with abstract filter', async () => {
    const res = await expandUrl('http://terminology.hl7.org/ValueSet/v3-RoleCode', 'filter=MT&excludeNotForUI=true');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toContainExactly([
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
    const preexpandedValueSet = await postResource(preexpanded);

    const include: ValueSet = valueSet(
      { valueSet: [preexpandedValueSet.url] },
      {
        system: 'http://loinc.org',
        concept: [
          { code: '8480-6', display: 'Systolic BP - Reported' },
          { code: '8462-4', display: 'Diastolic BP - Reported' },
        ],
      }
    );
    const vs = await postResource(include);

    const res = await expandUrl(vs.url, 'filter=reported');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toContainExactly([
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
    const codeSystem = await postResource({
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
    });
    const res = await expandInline(valueSet({ system: codeSystem.url }), 'filter=hives');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toStrictEqual([{ code: 'UTIC', display: 'Hives', system: codeSystem.url }]);
  });

  test('Condenses multiple synonyms in expansion', async () => {
    const codeSystem = await postResource({
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
    });
    const res = await expandInline(valueSet({ system: codeSystem.url }));
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { system: codeSystem.url, code: 'HIV', display: 'Hives', designation: [{ value: 'Wheal' }] },
    ]);
  });

  test('offset counts distinct codes, not synonym rows', async () => {
    const codeSystem = await postResource({
      resourceType: 'CodeSystem',
      url: `urn:uuid:${randomUUID()}`,
      status: 'draft',
      content: 'example',
      concept: [{ code: 'SOLO', display: 'primary display', designation: [{ value: 'a synonym' }] }],
    });

    const vs = valueSet({ system: codeSystem.url });
    const baseline = await expandInline(vs);
    expect(baseline.body.expansion.contains).toStrictEqual([
      {
        system: codeSystem.url,
        code: 'SOLO',
        display: 'primary display',
        designation: [{ value: 'a synonym' }],
      },
    ]);

    const offset = await expandInline(vs, 'offset=1');
    expect(offset).toHaveStatus(200);
    expect(offset.body.expansion.contains).toBeUndefined();
    expect(offset.body.expansion.total).toStrictEqual(1);
  });

  test('addExpansionItems() allows items out of order', () => {
    const rows = [
      { id: 'foo', code: 'F', display: 'Foo', synonymOf: 'bar', language: null },
      { id: 'bar', code: 'F', display: 'Food', synonymOf: null, language: null },
      { id: 'baz', code: 'F', display: 'Essen', synonymOf: 'bar', language: 'de' },
    ];
    const expansion: ValueSetExpansionContains[] = [];
    const system = 'http://example.com/codes/' + randomUUID();
    const codeSystem: WithId<CodeSystem> = {
      resourceType: 'CodeSystem',
      id: randomUUID(),
      status: 'draft',
      content: 'not-present',
      url: system,
    };

    addExpansionItems(rows, expansion, codeSystem);
    expect(expansion).toStrictEqual([
      {
        system,
        code: 'F',
        display: 'Food',
        designation: [
          { value: 'Foo', language: undefined },
          { value: 'Essen', language: 'de' },
        ],
      } satisfies ValueSetExpansionContains,
    ]);
  });

  test('Searches translated designations', async () => {
    const codeSystem = await postResource({
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
    });
    const res = await expandInline(valueSet({ system: codeSystem.url }), 'filter=non&displayLanguage=fr');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'MSG_INVALID_ID', display: 'ID non accepté', system: codeSystem.url },
    ]);
  });

  test('Only returns one (default) matching translation', async () => {
    const codeSystem = await postResource({
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
    });
    const res = await expandInline(valueSet({ system: codeSystem.url }), 'filter=accepted');
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'MSG_INVALID_ID', display: 'ID not accepted', system: codeSystem.url },
    ]);
  });

  test('Short filter (< 3 chars) does not match display substrings', async () => {
    // Below 3 characters the display-substring branch is dropped (the trigram index can't serve a
    // sub-trigram substring), so a 2-char filter matches only exact codes, never display substrings.
    const codeSystem = await postResource({
      resourceType: 'CodeSystem',
      url: 'http://example.com/CodeSystem/' + randomUUID(),
      content: 'complete',
      status: 'active',
      concept: [
        { code: 'HT', display: 'Alpha' },
        { code: 'HTX', display: 'Beta' }, // display contains 'et' but code does not
      ],
    });
    const vs = valueSet({ system: codeSystem.url });

    // 'et' is a substring of display 'Beta' (code HTX) but of no code → no matches.
    const displayOnly = await expandInline(vs, 'filter=et');
    expect(displayOnly).toHaveStatus(200);
    expect(displayOnly.body.expansion.contains).toBeUndefined();

    // The exact 2-char code 'HT' still matches.
    const codeMatch = await expandInline(vs, 'filter=HT');
    expect(codeMatch).toHaveStatus(200);
    expect(codeMatch.body.expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'HT', display: 'Alpha', system: codeSystem.url },
    ]);
  });

  test('Honors ValueSet designation overrides', async () => {
    const codeSystem = await postResource({
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
    });
    const res = await expandInline(
      valueSet({
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
      }),
      'filter=invalid&displayLanguage=fr'
    );
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains).toStrictEqual<ValueSetExpansionContains[]>([
      { code: 'MSG_INVALID_ID', display: 'Identifiant invalide', system: codeSystem.url },
    ]);
  });

  describe('Mixed include with referenced ValueSet', () => {
    const system = 'http://example.com/CodeSystem/mixed-' + randomUUID();
    const otherSystem = 'http://example.com/CodeSystem/mixed-other-' + randomUUID();
    const codeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'example',
      url: system,
      hierarchyMeaning: 'is-a',
      concept: [
        {
          code: 'PAR',
          display: 'parent',
          concept: [
            { code: 'CHD', display: 'child' },
            { code: 'PET', display: 'pet' },
          ],
        },
        { code: 'OTHER', display: 'other' }, // A separate root, NOT under PAR
      ],
    };
    const otherCodeSystem: CodeSystem = {
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'example',
      url: otherSystem,
      concept: [{ code: 'CHD', display: 'other child' }],
    };

    beforeAll(async () => {
      await postResource(codeSystem);
      await postResource(otherCodeSystem);
    });

    test('is-a filter over referenced concept-list ValueSet returns only the intersection', async () => {
      const referenced = await postResource(valueSet({ system, concept: [{ code: 'CHD' }, { code: 'OTHER' }] }));
      const vs = await postResource(
        valueSet({ system, filter: [{ property: 'concept', op: 'is-a', value: 'PAR' }], valueSet: [referenced.url] })
      );

      const res = await expandUrl(vs.url);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
      ]);
    });

    test('multiple referenced ValueSets in one include are intersected', async () => {
      const r1 = await postResource(valueSet({ system, concept: [{ code: 'CHD' }, { code: 'PET' }] }));
      const r2 = await postResource(valueSet({ system, concept: [{ code: 'CHD' }] }));
      const vs = await postResource(
        valueSet({ system, filter: [{ property: 'concept', op: 'is-a', value: 'PAR' }], valueSet: [r1.url, r2.url] })
      );

      const res = await expandUrl(vs.url);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
      ]);
    });

    test('unsatisfiable membership fails safe to an empty include', async () => {
      // Both ways a referenced ValueSet's membership cannot be pushed into the base system's SQL should
      // yield an empty include rather than an over-broad one that silently drops the intersection criterion.
      // (Note: this is distinct from the unsupported `regex`/`is-not-a`/`not-in` ops, which fail loudly instead.)
      const differentSystem = await postResource(valueSet({ system: otherSystem, concept: [{ code: 'CHD' }] }));
      const untranslatableFilter = await postResource(
        valueSet({ system, filter: [{ property: 'no-such-property', op: '=', value: 'x' }] })
      );

      for (const referenced of [differentSystem, untranslatableFilter]) {
        const vs = await postResource(
          valueSet({ system, filter: [{ property: 'concept', op: 'is-a', value: 'PAR' }], valueSet: [referenced.url] })
        );
        const res = await expandUrl(vs.url);
        expect(res).toHaveStatus(200);
        expect((res.body.expansion as ValueSetExpansion).contains ?? []).toHaveLength(0);
      }
    });

    test('pre-expanded referenced ValueSet checks listed codes against filter', async () => {
      const referenced = await postResource({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'http://example.com/ValueSet/mixed-preexpanded-' + randomUUID(),
        expansion: {
          timestamp: new Date().toISOString(),
          total: 2,
          contains: [
            { system, code: 'CHD', display: 'child' },
            { system, code: 'PAR', display: 'parent' },
          ],
        },
      } satisfies ValueSet);
      const vs = await postResource(
        valueSet({
          system,
          filter: [{ property: 'concept', op: 'descendent-of', value: 'PAR' }],
          valueSet: [referenced.url],
        })
      );

      const res = await expandUrl(vs.url);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
      ]);
    });

    test('pure multiple ValueSet references are intersected', async () => {
      const a = await postResource(valueSet({ system, concept: [{ code: 'CHD' }, { code: 'PET' }] }));
      const b = await postResource(valueSet({ system, concept: [{ code: 'CHD' }] }));
      const vs = await postResource(valueSet({ valueSet: [a.url, b.url] }));

      const res = await expandUrl(vs.url);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
      ]);
    });

    test('intersection with parameterized pre-expansion still bounds candidate systems', async () => {
      // A ValueSet whose stored expansion records the `parameter` it was computed with is not fully pre-expanded
      // for reuse, but its expansion is still usable to bound an intersection's candidate systems.
      // If ignored, the intersection sees no candidate systems and would return empty
      const preExpanded = await postResource({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'http://example.com/ValueSet/mixed-param-driver-' + randomUUID(),
        expansion: {
          timestamp: new Date().toISOString(),
          total: 2,
          parameter: [{ name: 'count', valueInteger: 100 }],
          contains: [
            { system, code: 'CHD', display: 'child' },
            { system, code: 'PET', display: 'pet' },
          ],
        },
      } satisfies ValueSet);
      const member = await postResource(valueSet({ system, concept: [{ code: 'CHD' }] }));
      const outer = await postResource(valueSet({ valueSet: [preExpanded.url, member.url] }));

      const res = await expandUrl(outer.url);
      expect(res).toHaveStatus(200);
      expect(res.body.expansion.contains).toContainExactly([{ system, code: 'CHD', display: 'child' }]);
    });

    test(`intersecting a multi-system grouping ValueSet with a whole-system reference keeps only that system's codes`, async () => {
      const grouping = await postResource(
        valueSet(
          { system, concept: [{ code: 'CHD' }, { code: 'PET' }] },
          { system: otherSystem, concept: [{ code: 'CHD' }] }
        )
      );
      const allOfSystem = await postResource(valueSet({ system }));
      const outer = await postResource(valueSet({ valueSet: [grouping.url, allOfSystem.url] }));

      const res = await expandUrl(outer.url);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
        { system, code: 'PET', display: 'pet' },
      ]);
    });

    test('Intersection across systems returns every member, grouped by system', async () => {
      const driver = await postResource({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'http://example.com/ValueSet/mixed-driver-' + randomUUID(),
        expansion: {
          timestamp: new Date().toISOString(),
          total: 3,
          // Interleaved ordering of different systems
          contains: [
            { system, code: 'PET', display: 'pet' },
            { system: otherSystem, code: 'CHD', display: 'other child' },
            { system, code: 'CHD', display: 'child' },
          ],
        },
      } satisfies ValueSet);
      const member = await postResource(
        valueSet(
          { system, concept: [{ code: 'CHD' }, { code: 'PET' }] },
          { system: otherSystem, concept: [{ code: 'CHD' }] }
        )
      );
      const outer = await postResource(valueSet({ valueSet: [driver.url, member.url] }));

      const res = await expandUrl(outer.url);
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;
      // The intersection is pushed into per-system SQL, so results are grouped by system (in the order the systems
      // first appear in the driver) rather than preserving the driver's cross-system interleaving. Crucially, the
      // same code in two different systems (`system|CHD` and `otherSystem|CHD`) must both survive — they are not
      // collapsed. Within a system, ordering follows the underlying index scan.
      expect(expansion.contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
        { system, code: 'PET', display: 'pet' },
        { system: otherSystem, code: 'CHD', display: 'other child' },
      ]);
      // System grouping: both `system` entries precede the `otherSystem` entry.
      const systemsInOrder = expansion.contains?.map((c) => c.system);
      expect(systemsInOrder?.indexOf(otherSystem)).toBe(2);
    });

    test('Multiple ValueSet references intersect order-independently and are not truncated before intersecting', async () => {
      // A ⊇ B: is-a PAR = {PAR, CHD, PET}; B = {CHD, PET}. The true intersection is {CHD, PET}. With count=1 the
      // old driver-then-filter approach truncated the *driver* to 1 row before intersecting, so [A,B] and [B,A]
      // returned different (and sometimes empty) results. The intersection must instead be order-independent and
      // still reachable under a small count, with `total` signalling that more members exist.
      const a = await postResource(valueSet({ system, filter: [{ property: 'concept', op: 'is-a', value: 'PAR' }] }));
      const b = await postResource(valueSet({ system, concept: [{ code: 'CHD' }, { code: 'PET' }] }));

      async function expandCount1(...urls: string[]): Promise<ValueSetExpansion> {
        const outer = await postResource(valueSet({ valueSet: urls }));
        const res = await request(app)
          .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(outer.url)}&count=1`)
          .set('Authorization', 'Bearer ' + accessToken);
        expect(res).toHaveStatus(200);
        return res.body.expansion as ValueSetExpansion;
      }

      const forward = await expandCount1(a.url, b.url);
      const reverse = await expandCount1(b.url, a.url);

      // Both orderings agree, return exactly one code (the count), and report ≥2 total available.
      expect(forward.contains).toHaveLength(1);
      expect(reverse.contains).toStrictEqual(forward.contains);
      expect(forward.total).toBeGreaterThanOrEqual(2);
      // The single returned code is a genuine member of the intersection {CHD, PET}, never PAR (only in A).
      expect(['CHD', 'PET']).toContain(forward.contains?.[0]?.code);
    });

    test('generalizes filter selects the code together with its ancestors', async () => {
      // generalizes CHD selects CHD together with its ancestors: {CHD, PAR}
      const generalizes = await postResource(
        valueSet({ system, filter: [{ property: 'concept', op: 'generalizes', value: 'CHD' }] })
      );
      const generalizesRes = await expandUrl(generalizes.url);
      expect(generalizesRes).toHaveStatus(200);
      expect((generalizesRes.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
        { system, code: 'PAR', display: 'parent' },
      ]);
    });

    test.each(['is-not-a', 'not-in', 'regex'] as const)(
      'unsupported filter op "%s" fails loudly rather than returning an empty expansion',
      async (op) => {
        const direct = await postResource(valueSet({ system, filter: [{ property: 'concept', op, value: 'CHD' }] }));
        const directRes = await expandUrl(direct.url);
        expect(directRes).toHaveStatus(400);
        expect(directRes.body.issue?.[0]?.details?.text).toMatch(
          new RegExp(`Unsupported ValueSet filter operation "${op}"`)
        );

        const referenced = await postResource(
          valueSet({ system, filter: [{ property: 'concept', op, value: 'CHD' }] })
        );
        const outer = await postResource(valueSet({ system, concept: [{ code: 'CHD' }], valueSet: [referenced.url] }));
        const outerRes = await expandUrl(outer.url);
        expect(outerRes).toHaveStatus(400);
      }
    );

    test('A → B → A cycle on valueSet include path returns an error', async () => {
      const urlA = 'http://example.com/ValueSet/mixed-cycleA-' + randomUUID();
      const urlB = 'http://example.com/ValueSet/mixed-cycleB-' + randomUUID();
      await postResource({
        resourceType: 'ValueSet',
        status: 'active',
        url: urlA,
        compose: { include: [{ system, concept: [{ code: 'CHD' }], valueSet: [urlB] }] },
      } satisfies ValueSet);
      await postResource({
        resourceType: 'ValueSet',
        status: 'active',
        url: urlB,
        compose: { include: [{ system, concept: [{ code: 'CHD' }], valueSet: [urlA] }] },
      } satisfies ValueSet);

      const res = await expandUrl(urlA);
      expect(res).toHaveStatus(400);
    });

    test('diamond references to a shared base ValueSet expand without a false cycle error', async () => {
      const approved = await postResource(
        valueSet({ system, concept: [{ code: 'CHD' }, { code: 'PET' }, { code: 'OTHER' }] })
      );
      // Hierarchy below PAR, restricted to the approved list (which drops the abstract PAR): { CHD, PET }.
      const kindsOfPar = await postResource(
        valueSet({ system, filter: [{ property: 'concept', op: 'is-a', value: 'PAR' }], valueSet: [approved.url] })
      );
      // A hand-picked set, restricted to the approved list (drops PAR): { PET, OTHER }.
      const handPicked = await postResource(
        valueSet({ system, concept: [{ code: 'PET' }, { code: 'OTHER' }, { code: 'PAR' }], valueSet: [approved.url] })
      );
      // Intersection of the two refinements above, neither of which contains the other
      const outer = await postResource(valueSet({ system, valueSet: [kindsOfPar.url, handPicked.url] }));

      const res = await expandUrl(outer.url);
      expect(res).toHaveStatus(200);
      expect(res.body.expansion.contains).toContainExactly([{ system, code: 'PET', display: 'pet' }]);
    });

    test('two includes each intersecting an orthogonal filter with a nested is-a ValueSet', async () => {
      // Complex intersection and filtering case: an outer ValueSet whose two includes each add an
      // orthogonal property filter (`defined = true`, independent of the hierarchy) on top of a
      // different nested is-a ValueSet. The two is-a subtrees overlap, so the union across the two includes must dedupe
      //   ENDO ─┬─ ENDO_DEF   (defined)      METAB ─┬─ METAB_DEF   (defined)
      //         ├─ ENDO_PRIM  (primitive)           ├─ METAB_PRIM  (primitive)
      //         └─ SHARED_DEF (defined) ────────────┘  (second parent → in both subtrees)
      const hierarchy = 'http://example.com/CodeSystem/scale-' + randomUUID();
      const defined = { code: 'defined', valueBoolean: true };
      await postResource({
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'example',
        url: hierarchy,
        hierarchyMeaning: 'is-a',
        property: [{ code: 'defined', type: 'boolean' }],
        concept: [
          {
            code: 'METAB',
            display: 'metabolic disease',
            concept: [
              { code: 'METAB_DEF', display: 'fully-defined metabolic', property: [defined] },
              { code: 'METAB_PRIM', display: 'primitive metabolic' },
            ],
          },
          {
            code: 'ENDO',
            display: 'endocrine disorder',
            concept: [
              { code: 'ENDO_DEF', display: 'fully-defined endocrine', property: [defined] },
              { code: 'ENDO_PRIM', display: 'primitive endocrine' },
              {
                code: 'SHARED_DEF',
                display: 'fully-defined endocrine + metabolic',
                // `defined` is orthogonal to the hierarchy; the `is-a` property adds METAB as a second parent.
                property: [defined, { code: 'is-a', valueCode: 'METAB' }],
              },
            ],
          },
        ],
      } satisfies CodeSystem);

      const nestedEndo = await postResource(
        valueSet({ system: hierarchy, filter: [{ property: 'concept', op: 'is-a', value: 'ENDO' }] })
      );
      const nestedMetab = await postResource(
        valueSet({ system: hierarchy, filter: [{ property: 'concept', op: 'is-a', value: 'METAB' }] })
      );

      // Precondition: the poly-hierarchy makes SHARED_DEF a member of BOTH nested is-a sets, so the outer union
      // genuinely has an overlap to dedup.
      const metabExpansion = (await expandUrl(nestedMetab.url)).body.expansion as ValueSetExpansion;
      expect(metabExpansion.contains?.map((c) => c.code)).toContain('SHARED_DEF');

      const outer = await postResource(
        valueSet(
          { system: hierarchy, filter: [{ property: 'defined', op: '=', value: 'true' }], valueSet: [nestedEndo.url] },
          { system: hierarchy, filter: [{ property: 'defined', op: '=', value: 'true' }], valueSet: [nestedMetab.url] }
        )
      );

      const res = await expandUrl(outer.url);
      expect(res).toHaveStatus(200);
      const expanded = res.body as ValueSet;
      expect(expanded.expansion?.contains?.map((c) => c.code)).toContainExactly([
        'ENDO_DEF',
        'METAB_DEF',
        'SHARED_DEF',
      ]);
    });

    test('two hierarchy-filtered references in one include intersect without CTE collision', async () => {
      const isaRef = await postResource(
        valueSet({ system, filter: [{ property: 'concept', op: 'is-a', value: 'PAR' }] })
      );
      const descRef = await postResource(
        valueSet({ system, filter: [{ property: 'concept', op: 'descendent-of', value: 'PAR' }] })
      );
      const outer = await postResource(
        valueSet({
          system,
          concept: [{ code: 'PAR' }, { code: 'CHD' }, { code: 'PET' }, { code: 'OTHER' }],
          valueSet: [isaRef.url, descRef.url],
        })
      );
      const res = await expandUrl(outer.url);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
        { system, code: 'PET', display: 'pet' },
      ]);
    });

    test('generalizes filter inside a referenced ValueSet contributes an ancestor membership predicate', async () => {
      const genRef = await postResource(
        valueSet({ system, filter: [{ property: 'concept', op: 'generalizes', value: 'CHD' }] })
      );
      const outer = await postResource(
        valueSet({ system, concept: [{ code: 'CHD' }, { code: 'PAR' }, { code: 'PET' }], valueSet: [genRef.url] })
      );
      const res = await expandUrl(outer.url);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system, code: 'CHD', display: 'child' },
        { system, code: 'PAR', display: 'parent' },
      ]);
    });

    test('Cross-system intersection with offset spanning a system boundary', async () => {
      const driver = await postResource({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'http://example.com/ValueSet/mixed-offset-driver-' + randomUUID(),
        expansion: {
          timestamp: new Date().toISOString(),
          total: 3,
          contains: [
            { system, code: 'CHD', display: 'child' },
            { system, code: 'PET', display: 'pet' },
            { system: otherSystem, code: 'CHD', display: 'other child' },
          ],
        },
      } satisfies ValueSet);
      const member = await postResource(
        valueSet(
          { system, concept: [{ code: 'CHD' }, { code: 'PET' }] },
          { system: otherSystem, concept: [{ code: 'CHD' }] }
        )
      );
      const outer = await postResource(valueSet({ valueSet: [driver.url, member.url] }));
      const res = await request(app)
        .get(`/fhir/R4/ValueSet/$expand?url=${encodeURIComponent(outer.url)}&count=50&offset=2`)
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system: otherSystem, code: 'CHD', display: 'other child' },
      ]);
    });

    test('text filter applies to intersection of nested ValueSets', async () => {
      const a = await postResource(valueSet({ system, concept: [{ code: 'CHD' }, { code: 'PET' }] }));
      const b = await postResource(valueSet({ system, concept: [{ code: 'CHD' }, { code: 'PET' }, { code: 'PAR' }] }));
      const outer = await postResource(valueSet({ valueSet: [a.url, b.url] }));
      const res = await expandUrl(outer.url, 'filter=pet');
      expect(res).toHaveStatus(200);
      expect((res.body.expansion as ValueSetExpansion).contains).toContainExactly([
        { system, code: 'PET', display: 'pet' },
      ]);
    });

    test('is-a filter on a grouped-by CodeSystem fails loudly when referenced by outer ValueSet', async () => {
      const groupedUrl = 'http://example.com/CodeSystem/grouped-' + randomUUID();
      await postResource({
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'complete',
        url: groupedUrl,
        hierarchyMeaning: 'grouped-by',
        concept: [{ code: 'A', concept: [{ code: 'B' }] }],
      } satisfies CodeSystem);
      const ref = await postResource(
        valueSet({ system: groupedUrl, filter: [{ property: 'concept', op: 'is-a', value: 'A' }] })
      );
      const outer = await postResource(
        valueSet({ system: groupedUrl, concept: [{ code: 'A' }, { code: 'B' }], valueSet: [ref.url] })
      );
      const res = await expandUrl(outer.url);
      expect(res).toHaveStatus(400);
    });
  });

  describe('count/offset budget across includes', () => {
    const system = 'http://example.com/CodeSystem/budget-' + randomUUID();
    const sysX = 'http://example.com/CodeSystem/budget-x-' + randomUUID();
    const sysY = 'http://example.com/CodeSystem/budget-y-' + randomUUID();

    beforeAll(async () => {
      await postResource({
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'example',
        url: system,
        hierarchyMeaning: 'is-a',
        concept: [
          {
            code: 'PAR',
            display: 'parent',
            concept: [
              { code: 'CHD', display: 'child' },
              { code: 'PET', display: 'pet' },
            ],
          },
          { code: 'OTHER', display: 'other' }, // A separate root, NOT under PAR
        ],
      } satisfies CodeSystem);
      await postResource({
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'example',
        url: sysX,
        concept: [
          { code: 'x1', display: 'x one' },
          { code: 'x2', display: 'x two' },
        ],
      } satisfies CodeSystem);
      await postResource({
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'example',
        url: sysY,
        concept: [
          { code: 'y1', display: 'y one' },
          { code: 'y2', display: 'y two' },
        ],
      } satisfies CodeSystem);
    });

    test('later sibling include receives the remaining budget so total is reported accurately', async () => {
      const res = await expandInline(
        valueSet(
          { system, concept: [{ code: 'OTHER' }] },
          { system, filter: [{ property: 'concept', op: 'is-a', value: 'PAR' }] }
        ),
        'count=2'
      );
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      expect(expansion.contains).toHaveLength(2); // page bounded to count
      // total is count+1: the budget was reduced by include #1's contribution, so it is not an over-fetch artifact.
      expect(expansion.total).toBe(3);
    });

    test('offset is applied once across the whole expansion, not per include', async () => {
      // Two plain single-system includes, each selecting 2 codes → 4 codes combined. A single global offset=1
      // drops exactly ONE code across the whole expansion, leaving 3 — the offset is not re-applied to each include.
      const vs = await postResource(valueSet({ system: sysX }, { system: sysY }));

      const res = await expandUrl(vs.url, 'count=50&offset=1');
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      // Global offset=1 leaves 3 of the 4 codes (only the very first code of the overall expansion is skipped).
      expect(expansion.contains).toHaveLength(3);
    });

    test('pure reference to a pre-expanded ValueSet honors count with a count+1 signal', async () => {
      // A fully pre-expanded ValueSet is flattened by the pre-expansion path, which now pages the result: it keeps
      // one past `count` so, with count=1 over 4 members, the whole expansion holds 2 codes → `total` = count+1 = 2
      // and the returned page is trimmed to 1. (Not the full member count, which would ignore the requested count.)
      const preExpanded = await postResource({
        resourceType: 'ValueSet',
        status: 'active',
        url: 'http://example.com/ValueSet/budget-preexpanded-' + randomUUID(),
        expansion: {
          timestamp: new Date().toISOString(),
          total: 4,
          contains: [
            { system, code: 'PAR', display: 'parent' },
            { system, code: 'CHD', display: 'child' },
            { system, code: 'PET', display: 'pet' },
            { system, code: 'OTHER', display: 'other' },
          ],
        },
      } satisfies ValueSet);
      const vs = await postResource(valueSet({ valueSet: [preExpanded.url] }));

      const res = await expandUrl(vs.url, 'count=1');
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;

      expect(expansion.contains).toHaveLength(1); // page trimmed to count
      // count is honored: only count+1 members are kept, so total is the count+1 = 2 signal, not the full size.
      expect(expansion.total).toBe(2);
    });

    test('pages over distinct codes for stable deep pagination', async () => {
      // Each code carries two base-language designations, so the CodeSystem has 5 primary + 10 synonym Coding rows.
      // If paging counted rows a LIMIT would be consumed by synonyms, resulting in empty pages deep in the expansion
      const cs = await postResource({
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'example',
        url: 'http://example.com/CodeSystem/syn-page-' + randomUUID(),
        concept: [
          { code: 'c1', display: 'code one', designation: [{ value: 'one-a' }, { value: 'one-b' }] },
          { code: 'c2', display: 'code two', designation: [{ value: 'two-a' }, { value: 'two-b' }] },
          { code: 'c3', display: 'code three', designation: [{ value: 'three-a' }, { value: 'three-b' }] },
          { code: 'c4', display: 'code four', designation: [{ value: 'four-a' }, { value: 'four-b' }] },
          { code: 'c5', display: 'code five', designation: [{ value: 'five-a' }, { value: 'five-b' }] },
        ],
      } satisfies CodeSystem);
      const vs = valueSet({ system: cs.url });

      // count == the number of distinct codes: all 5 come back and total is exact (not deflated by the synonym rows).
      const full = (await expandInline(vs, 'count=5')).body.expansion as ValueSetExpansion;
      expect(full.contains).toHaveLength(5);
      expect(full.total).toBe(5);
      // Designations for the returned page are still hydrated (base-language synonyms fold back in).
      expect(full.contains?.every((c) => c.designation?.length === 2)).toBe(true);

      // A deep page near the end returns the non-empty tail (previously empty: synonym rows had consumed the budget).
      const tail = (await expandInline(vs, 'count=2&offset=4')).body.expansion as ValueSetExpansion;
      expect(tail.contains).toHaveLength(1);
      expect(tail.total).toBe(5);
    });

    test('include that exactly exhausts the budget maintains pagination to next include', async () => {
      const vs = await postResource(valueSet({ system: sysX }, { system: sysY }));

      const res = await expandUrl(vs.url, 'count=2');
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;
      expect(expansion.contains?.map((c) => c.code)).toContainExactly(['x1', 'x2']);
      expect(expansion.total).toBe(3); // count+1 signals more members despite no over-fetch

      // Paging past the first include actually reaches the second include's members
      const page2 = await expandUrl(vs.url, 'count=2&offset=2');
      expect(page2).toHaveStatus(200);
      expect((page2.body.expansion as ValueSetExpansion).contains?.map((c) => c.code)).toContainExactly(['y1', 'y2']);
    });

    test('intersection that exhausts the budget mid-system-loop maintains pagination', async () => {
      const ref1 = await postResource(valueSet({ system: sysX }, { system: sysY }));
      const ref2 = await postResource(valueSet({ system: sysX }, { system: sysY }));
      const outer = await postResource(valueSet({ valueSet: [ref1.url, ref2.url] }));

      const res = await expandUrl(outer.url, 'count=2');
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;
      expect(expansion.contains).toHaveLength(2);
      expect(expansion.total).toBe(3);
    });

    test('expansion of exactly the maximum size does not paginate', async () => {
      const concept = Array.from({ length: 1000 }, (_, i) => ({ code: `max${i}`, display: `code number ${i}` }));
      const cs = await postResource({
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'example',
        url: 'http://example.com/CodeSystem/budget-max-' + randomUUID(),
        concept,
      } satisfies CodeSystem);

      const res = await expandInline(valueSet({ system: cs.url }), 'count=1000');
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;
      expect(expansion.contains).toHaveLength(1000);
      expect(expansion.total).toBe(1000);
    });
  });

  describe('cross-system code collisions', () => {
    const csA = 'http://example.com/CodeSystem/collide-a-' + randomUUID();
    const csB = 'http://example.com/CodeSystem/collide-b-' + randomUUID();

    beforeAll(async () => {
      // Two systems that deliberately share the code string `dup` with distinct displays
      await postResource({
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'example',
        url: csA,
        concept: [{ code: 'dup', display: 'shared alpha thing' }],
      } satisfies CodeSystem);
      await postResource({
        resourceType: 'CodeSystem',
        status: 'active',
        content: 'example',
        url: csB,
        concept: [{ code: 'dup', display: 'shared beta thing' }],
      } satisfies CodeSystem);
    });

    test('expansion can contain same code in two different code systems', async () => {
      const res = await expandInline(valueSet({ system: csA }, { system: csB }), 'count=10');
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;
      // Both concepts are returned; neither display is demoted to a designation on the other's entry
      expect(expansion.contains).toContainExactly([
        { system: csA, code: 'dup', display: 'shared alpha thing' },
        { system: csB, code: 'dup', display: 'shared beta thing' },
      ]);
      expect(expansion.contains?.every((c) => c.designation === undefined)).toBe(true);
      expect(expansion.total).toBe(2);
    });

    test('colliding codes both present in expansion when text filter matches both displays', async () => {
      const vs = valueSet({ system: csA }, { system: csB });
      const res = await expandInline(vs, 'filter=shared&count=10');
      expect(res).toHaveStatus(200);
      const expansion = res.body.expansion as ValueSetExpansion;
      expect(expansion.contains).toContainExactly([
        { system: csA, code: 'dup', display: 'shared alpha thing' },
        { system: csB, code: 'dup', display: 'shared beta thing' },
      ]);
      expect(expansion.total).toBe(2);
    });
  });

  test('Intersection membership strategy', async () => {
    const cs = await postResource({
      resourceType: 'CodeSystem',
      status: 'active',
      content: 'example',
      url: 'http://example.com/CodeSystem/int-strategy-' + randomUUID(),
      hierarchyMeaning: 'is-a',
      concept: [
        {
          code: 'ROOT',
          display: 'root node',
          concept: [
            {
              code: 'A',
              display: 'alpha node',
              concept: [
                { code: 'A1', display: 'alpha one node' },
                { code: 'A2', display: 'alpha two node' },
              ],
            },
            { code: 'B', display: 'beta node', concept: [{ code: 'B1', display: 'beta one node' }] },
          ],
        },
      ],
    } satisfies CodeSystem);
    const subRoot = await postResource(
      valueSet({ system: cs.url, filter: [{ property: 'concept', op: 'is-a', value: 'ROOT' }] })
    );
    const subA = await postResource(
      valueSet({ system: cs.url, filter: [{ property: 'concept', op: 'is-a', value: 'A' }] })
    );
    const descendantsOfA = await postResource(
      valueSet({ system: cs.url, filter: [{ property: 'concept', op: 'descendent-of', value: 'A' }] })
    );

    const intersectionA = valueSet({ valueSet: [subRoot.url, subA.url] });

    // No filter, subtree (descendant) strategy
    const broad = (await expandInline(intersectionA, 'count=100')).body.expansion as ValueSetExpansion;
    expect((broad.contains ?? []).map((c) => c.code).sort()).toStrictEqual(['A', 'A1', 'A2']);

    // Selective text filter, ancestor strategy. Must produce the same set
    const filtered = await expandInline(intersectionA, 'filter=node&count=100');
    expect(filtered.body.expansion.contains?.map((c: ValueSetExpansionContains) => c.code)).toContainExactly([
      'A',
      'A1',
      'A2',
    ]);

    const intersectionDescendants = valueSet({ valueSet: [subRoot.url, descendantsOfA.url] });
    const filtered2 = await expandInline(intersectionDescendants, 'filter=node&count=100');
    // `descendent-of A` excludes A itself, so the intersection is just A's descendants
    expect(filtered2.body.expansion.contains.map((c: ValueSetExpansionContains) => c.code)).toContainExactly([
      'A1',
      'A2',
    ]);
  });

  test('Base resources are not shadowed for Super Admin', async () => {
    const url = 'https://medplum.com/fhir/ValueSet/resource-types';
    await postResource({
      resourceType: 'CodeSystem',
      status: 'active',
      url,
      content: 'not-present',
    });

    const superAdminToken = await initTestAuth({ superAdmin: true });
    const res = await request(app)
      .get(`/fhir/R4/ValueSet/$expand?url=${url}&filter=clien`)
      .set('Authorization', 'Bearer ' + superAdminToken);
    expect(res).toHaveStatus(200);
    expect(res.body.expansion.contains[0].display).toStrictEqual('ClientApplication');
  });
});
