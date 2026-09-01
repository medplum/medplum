// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { CodeSystem, Parameters, ParametersParameter, ValueSet } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();
const system = 'http://terminology.hl7.org/CodeSystem/v3-RoleCode';

const testValueSet: ValueSet = {
  resourceType: 'ValueSet',
  url: 'http://example.com/test-valueset-' + randomUUID(),
  name: 'testValueSet',
  title: 'Test Value Set',
  status: 'active',
  compose: {
    include: [
      {
        system,
        concept: [{ code: 'WARD' }],
      },
      {
        system,
        filter: [{ property: 'concept', op: 'descendent-of', value: '_PersonalRelationshipRoleType' }],
      },
      {
        system,
        filter: [{ property: 'status', op: '=', value: 'deprecated' }],
      },
      {
        system,
        filter: [{ property: 'child', op: 'in', value: 'PEDICU,PEDE' }],
      },
    ],
  },
};

describe('ValueSet validate-code', () => {
  let valueSet: ValueSet;
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    accessToken = await initTestAuth({ superAdmin: true });
    expect(accessToken).toBeDefined();

    const res = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(testValueSet);
    expect(res).toHaveStatus(201);
    valueSet = res.body as ValueSet;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Explicitly included code succeeds', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: valueSet.url },
          { name: 'coding', valueCoding: { system, code: 'WARD' } },
        ],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toStrictEqual('ward');
  });

  test.each<ParametersParameter[]>([
    [
      { name: 'system', valueUri: system },
      { name: 'code', valueCode: 'ITWINBRO' },
    ],
    [{ name: 'coding', valueCoding: { system, code: 'ITWINBRO' } }],
    [
      {
        name: 'codeableConcept',
        valueCodeableConcept: {
          coding: [
            { system, code: 'VET' },
            { system, code: 'ITWINBRO' },
          ],
        },
      },
    ],
  ])('Filter included code succeeds: %j', async (...params: ParametersParameter[]) => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'url', valueUri: valueSet.url }, ...params],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toStrictEqual('identical twin brother');
  });

  test('Filter excluded code fails', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: valueSet.url },
          { name: 'coding', valueCoding: { system, code: 'RETIREE' } },
        ],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(false);
  });

  test('Returns negative result on display mismatch', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: valueSet.url },
          { name: 'coding', valueCoding: { system, code: 'AUNT' } },
          { name: 'display', valueString: 'ant' },
        ],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(false);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toStrictEqual('aunt');
  });

  test('Returns negative result when no coding matches', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: valueSet.url },
          { name: 'coding', valueCoding: { system: 'http://example.com/other', code: 'foo' } },
        ],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(false);
    expect(output.parameter?.find((p) => p.name === 'display')).toBeUndefined();
  });

  test('Returns error when no coding specified', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: valueSet.url },
          { name: 'code', valueCode: 'RETIREE' },
        ],
      });
    expect(res2).toHaveStatus(400);
    expect(res2.body.resourceType).toStrictEqual('OperationOutcome');
  });

  test('Validates coding via property filter', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: valueSet.url },
          { name: 'coding', valueCoding: { system, code: 'NOK' } },
        ],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toStrictEqual('next of kin');
  });

  test('Validates coding via property filter with multiple values', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: valueSet.url },
          { name: 'coding', valueCoding: { system, code: 'PEDC' } },
        ],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toStrictEqual('Pediatrics clinic');
  });

  test('Validates code when only example CodeSystem is present', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: 'http://hl7.org/fhir/ValueSet/observation-codes' },
          { name: 'coding', valueCoding: { system: 'http://loinc.org', code: '10727-6' } },
        ],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')).toBeUndefined();
  });

  test('Does not validate display without authoritative CodeSystem', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: 'http://hl7.org/fhir/ValueSet/observation-codes' },
          { name: 'coding', valueCoding: { system: 'http://loinc.org', code: '10727-6' } },
          { name: 'display', valueString: 'Cat parasites' },
        ],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(false);
    expect(output.parameter?.find((p) => p.name === 'display')).toBeUndefined();
  });

  test('GET endpoint', async () => {
    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/$validate-code?url=${valueSet.url}&system=${system}&code=WARD`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toStrictEqual('ward');
  });

  test('GET instance endpoint', async () => {
    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/${valueSet.id}/$validate-code?system=${system}&code=WARD`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toStrictEqual('ward');
  });

  test('Instance endpoint with coding', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/${valueSet.id}/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system, code: 'WARD' } }],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toStrictEqual('ward');
  });

  test('Validates code against an include with multiple filters', async () => {
    const multiSystem = 'http://example.com/multi-filter-' + randomUUID();
    const codeSystem = {
      resourceType: 'CodeSystem',
      url: multiSystem,
      status: 'active',
      content: 'complete',
      hierarchyMeaning: 'is-a',
      property: [{ code: 'kind', type: 'code' }],
      concept: [
        {
          code: 'ROOT',
          display: 'Root',
          concept: [
            { code: 'CHILD1', display: 'Child One', property: [{ code: 'kind', valueCode: 'primary' }] },
            { code: 'CHILD2', display: 'Child Two', property: [{ code: 'kind', valueCode: 'secondary' }] },
          ],
        },
      ],
    } satisfies CodeSystem;
    const csRes = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(codeSystem);
    expect(csRes).toHaveStatus(201);

    const vsRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        url: 'http://example.com/multi-filter-vs-' + randomUUID(),
        status: 'active',
        compose: {
          include: [
            {
              system: multiSystem,
              filter: [
                { property: 'concept', op: 'descendent-of', value: 'ROOT' },
                { property: 'kind', op: '=', value: 'primary' },
              ],
            },
          ],
        },
      } satisfies ValueSet);
    expect(vsRes).toHaveStatus(201);
    const vs = vsRes.body as ValueSet;

    const validateRes = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: vs.url },
          {
            name: 'codeableConcept',
            valueCodeableConcept: {
              coding: [
                { system: multiSystem, code: 'ROOT' },
                { system: multiSystem, code: 'CHILD2' },
                { system: multiSystem, code: 'CHILD1' },
              ],
            },
          },
        ],
      });
    expect(validateRes).toHaveStatus(200);
    const output = validateRes.body as Parameters;
    expect(output.parameter).toContainExactly([
      { name: 'result', valueBoolean: true },
      { name: 'display', valueString: 'Child One' },
    ]);
  });

  test('Validates system-less coding matched by a later include', async () => {
    // Create two different CodeSystems, each containing one code
    const systemA = 'http://example.com/system-a-' + randomUUID();
    const systemB = 'http://example.com/system-b-' + randomUUID();
    const candidateCodes = [
      [systemA, 'ALPHA', 'Alpha from A'],
      [systemB, 'TARGET', 'Target from B'],
    ];
    for (const [url, code, display] of candidateCodes) {
      const csRes = await request(app)
        .post('/fhir/R4/CodeSystem')
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'CodeSystem',
          url,
          status: 'active',
          content: 'complete',
          concept: [{ code, display }],
        } satisfies CodeSystem);
      expect(csRes).toHaveStatus(201);
    }

    const vsRes = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        url: 'http://example.com/two-system-vs-' + randomUUID(),
        status: 'active',
        compose: {
          // Two includes with different systems; the target code exists only in the second.
          include: [
            { system: systemA, concept: [{ code: 'ALPHA' }] },
            { system: systemB, concept: [{ code: 'TARGET' }] },
          ],
        },
      } satisfies ValueSet);
    expect(vsRes).toHaveStatus(201);
    const vs = vsRes.body as ValueSet;

    const validateRes = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: vs.url },
          // Look up bare code without system
          { name: 'coding', valueCoding: { code: 'TARGET' } },
        ],
      });
    expect(validateRes).toHaveStatus(200);
    // Display string should correctly be resolved from the second CodeSystem include
    expect(validateRes.body.parameter).toContainExactly([
      { name: 'result', valueBoolean: true },
      { name: 'display', valueString: 'Target from B' },
    ]);
  });

  test('Falls back to validating system URL when CodeSystem unavailable', async () => {
    const system = 'http://example.com/other-codes-' + randomUUID();
    const res = await request(app)
      .post('/fhir/R4/ValueSet')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'ValueSet',
        url: 'http://example.com/test-valueset-' + randomUUID(),
        status: 'active',
        compose: { include: [{ system }] },
      } satisfies ValueSet);
    expect(res).toHaveStatus(201);
    const vs = res.body as ValueSet;

    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: vs.url },
          { name: 'coding', valueCoding: { system, code: randomUUID() } },
        ],
      });
    expect(res2).toHaveStatus(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toBeUndefined();
  });
});
