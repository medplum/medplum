import { ContentType } from '@medplum/core';
import { ConceptMap, OperationOutcome, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();

describe('ConceptMap $translate', () => {
  const system = 'http://example.com/private-codes';
  const code = 'FSH';

  let accessToken: string;
  let conceptMap: ConceptMap;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  beforeEach(async () => {
    accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();

    const res = await request(app)
      .post(`/fhir/R4/ConceptMap`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ConceptMap',
        url: 'http://example.com/concept-map',
        status: 'active',
        sourceCanonical: 'http://example.com/labs',
        group: [
          {
            source: system,
            target: 'http://loinc.org',
            element: [
              {
                code,
                target: [
                  {
                    code: '15067-2',
                    display: 'Follitropin Qn',
                    equivalence: 'equivalent',
                  },
                ],
              },
            ],
          },
          {
            source: system,
            target: 'http://www.ama-assn.org/go/cpt',
            element: [
              {
                code,
                target: [{ code: '83001', equivalence: 'equivalent' }],
              },
            ],
          },
        ],
      });
    expect(res.status).toEqual(201);
    conceptMap = res.body as ConceptMap;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test.each<[string, ParametersParameter[]]>([
    [
      'with system and code',
      [
        { name: 'system', valueUri: system },
        { name: 'code', valueCode: code },
      ],
    ],
    ['with coding', [{ name: 'coding', valueCoding: { system, code } }]],
    ['with CodeableConcept', [{ name: 'codeableConcept', valueCodeableConcept: { coding: [{ system, code }] } }]],
  ])('Success %s', async (_format, params) => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: params,
      });
    expect(res.status).toBe(200);

    const output = (res.body as Parameters).parameter;
    expect(output?.find((p) => p.name === 'result')?.valueBoolean).toEqual(true);
    const matches = output?.filter((p) => p.name === 'match');
    expect(matches).toHaveLength(2);
    expect(matches?.[0]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equivalent',
        },
        {
          name: 'concept',
          valueCoding: {
            system: 'http://loinc.org',
            code: '15067-2',
            display: 'Follitropin Qn',
          },
        },
      ],
    });
    expect(matches?.[1]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equivalent',
        },
        {
          name: 'concept',
          valueCoding: {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '83001',
          },
        },
      ],
    });
  });

  test('Lookup by URL', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: conceptMap.url },
          { name: 'coding', valueCoding: { system, code } },
        ],
      });
    expect(res.status).toBe(200);

    const output = (res.body as Parameters).parameter;
    expect(output?.find((p) => p.name === 'result')?.valueBoolean).toEqual(true);
    const matches = output?.filter((p) => p.name === 'match');
    expect(matches).toHaveLength(2);
    expect(matches?.[0]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equivalent',
        },
        {
          name: 'concept',
          valueCoding: {
            system: 'http://loinc.org',
            code: '15067-2',
            display: 'Follitropin Qn',
          },
        },
      ],
    });
    expect(matches?.[1]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equivalent',
        },
        {
          name: 'concept',
          valueCoding: {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '83001',
          },
        },
      ],
    });
  });

  test('Lookup by source ValueSet', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'source', valueUri: conceptMap.sourceCanonical },
          { name: 'coding', valueCoding: { system, code } },
        ],
      });
    expect(res.status).toBe(200);

    const output = (res.body as Parameters).parameter;
    expect(output?.find((p) => p.name === 'result')?.valueBoolean).toEqual(true);
    const matches = output?.filter((p) => p.name === 'match');
    expect(matches).toHaveLength(2);
    expect(matches?.[0]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equivalent',
        },
        {
          name: 'concept',
          valueCoding: {
            system: 'http://loinc.org',
            code: '15067-2',
            display: 'Follitropin Qn',
          },
        },
      ],
    });
    expect(matches?.[1]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equivalent',
        },
        {
          name: 'concept',
          valueCoding: {
            system: 'http://www.ama-assn.org/go/cpt',
            code: '83001',
          },
        },
      ],
    });
  });

  test('Filter on target system', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: conceptMap.url },
          { name: 'targetsystem', valueUri: 'http://loinc.org' },
          { name: 'coding', valueCoding: { system, code } },
        ],
      });
    expect(res.status).toBe(200);

    const output = (res.body as Parameters).parameter;
    expect(output?.find((p) => p.name === 'result')?.valueBoolean).toEqual(true);
    const matches = output?.filter((p) => p.name === 'match');
    expect(matches).toHaveLength(1);
    expect(matches?.[0]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equivalent',
        },
        {
          name: 'concept',
          valueCoding: {
            system: 'http://loinc.org',
            code: '15067-2',
            display: 'Follitropin Qn',
          },
        },
      ],
    });
  });

  test('No match', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system, code: 'BAD' } }],
      });
    expect(res.status).toBe(200);

    const output = (res.body as Parameters).parameter;
    expect(output).toHaveLength(1);
    expect(output?.[0]).toMatchObject<ParametersParameter>({
      name: 'result',
      valueBoolean: false,
    });
  });

  test('No map specified', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system, code } }],
      });
    expect(res.status).toBe(400);

    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          details: { text: 'No ConceptMap specified' },
        },
      ],
    });
  });

  test('Code without system', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'code', valueCode: 'BAD' }],
      });
    expect(res.status).toBe(400);

    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          details: { text: `Missing required 'system' input parameter with 'code' parameter` },
        },
      ],
    });
  });

  test('Ambiguous coding provided', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'coding', valueCoding: { system, code } },
          { name: 'system', valueUri: system },
          { name: 'code', valueCode: 'BAD' },
        ],
      });
    expect(res.status).toBe(400);

    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'invalid',
          details: { text: `Ambiguous input: multiple source codings provided` },
        },
      ],
    });
  });

  test('No source coding', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
      });
    expect(res.status).toBe(400);

    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          details: {
            text: `No source provided: 'code'+'system', 'coding', or 'codeableConcept' input parameter is required`,
          },
        },
      ],
    });
  });

  test.each(['url', 'source'])('Not found by %s', async (paramName) => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: paramName, valueUri: conceptMap.url + 'BAD' },
          { name: 'coding', valueCoding: { system, code } },
        ],
      });
    expect(res.status).toBe(400);

    expect(res.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          details: {
            text: expect.stringMatching(/^ConceptMap .* not found$/),
          },
        },
      ],
    });
  });

  test('Unmapped code handling', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ConceptMap',
        url: 'http://example.com/concept-map',
        status: 'active',
        sourceCanonical: 'http://example.com/labs',
        group: [
          {
            source: system,
            target: system + '/v2',
            element: [
              {
                code: 'OTHER',
                target: [{ code: 'DISTINCT', equivalence: 'equivalent' }],
              },
            ],
            unmapped: {
              mode: 'provided',
            },
          },
          {
            source: system,
            target: 'http://example.com/other-system',
            element: [
              {
                code: 'OTHER',
                target: [{ code: '1', equivalence: 'equivalent' }],
              },
            ],
            unmapped: {
              mode: 'fixed',
              code: 'UNK',
              display: 'Unknown',
            },
          },
        ],
      });
    expect(res.status).toEqual(201);
    conceptMap = res.body as ConceptMap;

    const res2 = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system, code } }],
      });
    expect(res2.status).toBe(200);

    const output = (res2.body as Parameters).parameter;
    expect(output?.find((p) => p.name === 'result')?.valueBoolean).toEqual(true);
    const matches = output?.filter((p) => p.name === 'match');
    expect(matches).toHaveLength(2);
    expect(matches?.[0]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equal',
        },
        {
          name: 'concept',
          valueCoding: { system: system + '/v2', code },
        },
      ],
    });
    expect(matches?.[1]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equivalent',
        },
        {
          name: 'concept',
          valueCoding: {
            system: 'http://example.com/other-system',
            code: 'UNK',
            display: 'Unknown',
          },
        },
      ],
    });
  });

  test('Handles empty CodeableConcept', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'codeableConcept', valueCodeableConcept: { text: 'Nebulous concept' } }],
      });
    expect(res.status).toBe(200);

    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'result',
          valueBoolean: false,
        },
      ],
    });
  });

  test('Handles implicit system', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ConceptMap',
        url: 'http://example.com/concept-map',
        status: 'active',
        sourceCanonical: 'http://example.com/labs',
        group: [
          {
            target: 'http://loinc.org',
            element: [
              {
                code,
                target: [
                  {
                    code: '15067-2',
                    display: 'Follitropin Qn',
                    equivalence: 'equivalent',
                  },
                ],
              },
            ],
          },
        ],
      });
    expect(res.status).toEqual(201);
    conceptMap = res.body as ConceptMap;

    const res2 = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'codeableConcept', valueCodeableConcept: { coding: [{ code }] } }],
      });
    expect(res2.status).toBe(200);

    const output = (res2.body as Parameters).parameter;
    expect(output?.find((p) => p.name === 'result')?.valueBoolean).toEqual(true);
    const matches = output?.filter((p) => p.name === 'match');
    expect(matches).toHaveLength(1);
    expect(matches?.[0]).toMatchObject<ParametersParameter>({
      name: 'match',
      part: [
        {
          name: 'equivalence',
          valueCode: 'equivalent',
        },
        {
          name: 'concept',
          valueCoding: {
            system: 'http://loinc.org',
            code: '15067-2',
            display: 'Follitropin Qn',
          },
        },
      ],
    });
  });

  test('No mapping groups specified', async () => {
    const res = await request(app)
      .post(`/fhir/R4/ConceptMap`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ConceptMap',
        url: 'http://example.com/concept-map',
        status: 'active',
        sourceCanonical: 'http://example.com/labs',
        targetCanonical: 'http://example.com/loinc',
      });
    expect(res.status).toEqual(201);
    conceptMap = res.body as ConceptMap;

    const res2 = await request(app)
      .post(`/fhir/R4/ConceptMap/${conceptMap.id}/$translate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system, code } }],
      });
    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject({
      resourceType: 'OperationOutcome',
      issue: [
        {
          details: { text: 'ConceptMap does not specify a mapping group' },
          expression: ['ConceptMap.group'],
        },
      ],
    });
  });
});
