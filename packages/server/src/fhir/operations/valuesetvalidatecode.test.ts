import { ContentType } from '@medplum/core';
import { Parameters, ParametersParameter, ValueSet } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
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
        filter: [{ property: 'concept', op: 'is-a', value: '_PersonalRelationshipRoleType' }],
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
    expect(res.status).toEqual(201);
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
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toEqual('ward');
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
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toEqual('identical twin brother');
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
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
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
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(false);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toEqual('aunt');
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
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
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
      } as Parameters);
    expect(res2.status).toBe(400);
    expect(res2.body.resourceType).toEqual('OperationOutcome');
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
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
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
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
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
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toEqual('ward');
  });

  test('GET instance endpoint', async () => {
    const res2 = await request(app)
      .get(`/fhir/R4/ValueSet/${valueSet.id}/$validate-code?system=${system}&code=WARD`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toEqual('ward');
  });

  test('Instance endpoint with coding', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/ValueSet/${valueSet.id}/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system, code: 'WARD' } }],
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'result')?.valueBoolean).toBe(true);
    expect(output.parameter?.find((p) => p.name === 'display')?.valueString).toEqual('ward');
  });
});
