// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, SNOMED } from '@medplum/core';
import type { Parameters, ParametersParameter, ValueSet } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';
import type { Repository } from '../repo';

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
  let valueSet: WithId<ValueSet>;
  let accessToken: string;
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    ({ accessToken, repo } = await createTestProject({
      project: { superAdmin: true },
      withRepo: true,
      withAccessToken: true,
    }));
    valueSet = await repo.createResource<ValueSet>(testValueSet);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(400);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
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
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toStrictEqual('ward');
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
    expect(res.status).toStrictEqual(201);
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
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toStrictEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toBeUndefined();
  });

  test('Validates code present in recursive expansion', async () => {
    const code = '219422003';
    const inner = await repo.createResource<ValueSet & { url: string }>({
      resourceType: 'ValueSet',
      status: 'unknown',
      url: `http://example.com/ValueSet/${randomUUID()}`,
      compose: { include: [{ system: SNOMED, concept: [{ code }] }] },
    });
    const outer = await repo.createResource<ValueSet & { url: string }>({
      resourceType: 'ValueSet',
      status: 'unknown',
      url: `http://example.com/ValueSet/${randomUUID()}`,
      compose: { include: [{ valueSet: [inner.url] }] },
    });

    const res = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: outer.url },
          { name: 'coding', valueCoding: { system: SNOMED, code } },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('Parameters');
    const output = res.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
  });

  test('Avoids infinite loop on circular reference', async () => {
    const outerUrl = `http://example.com/ValueSet/${randomUUID()}`;
    const inner = await repo.createResource<ValueSet & { url: string }>({
      resourceType: 'ValueSet',
      status: 'unknown',
      url: `http://example.com/ValueSet/${randomUUID()}`,
      compose: { include: [{ valueSet: [outerUrl] }] },
    });
    const outer = await repo.createResource<ValueSet & { url: string }>({
      resourceType: 'ValueSet',
      status: 'unknown',
      url: outerUrl,
      compose: { include: [{ valueSet: [inner.url] }] },
    });

    const res = await request(app)
      .post(`/fhir/R4/ValueSet/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: outer.url },
          { name: 'coding', valueCoding: { system: SNOMED, code: 'foo' } },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('Parameters');
    const output = res.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(false);
  });
});
