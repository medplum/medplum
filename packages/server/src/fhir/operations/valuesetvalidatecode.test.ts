import { ContentType } from '@medplum/core';
import { Parameters, ValueSet } from '@medplum/fhirtypes';
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
        filter: [
          { property: 'status', op: '=', value: 'active' },
          { property: 'concept', op: 'is-a', value: '_CoverageRoleType' },
        ],
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
  });
});
