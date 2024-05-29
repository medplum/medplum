import { CodeSystem, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import { loadTestConfig } from '../../config';
import { initApp, shutdownApp } from '../../app';
import { initTestAuth } from '../../test.setup';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { ContentType } from '@medplum/core';
import { validateCodings } from './codesystemvalidatecode';

const app = express();

const testCodeSystem: CodeSystem = {
  resourceType: 'CodeSystem',
  url: 'http://example.com/test-code-system-' + randomUUID(),
  name: 'testCodeSystem',
  title: 'Test Code System',
  status: 'active',
  hierarchyMeaning: 'is-a',
  content: 'not-present',
};

describe('CodeSystem validate-code', () => {
  let codeSystem: CodeSystem;
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    accessToken = await initTestAuth({ superAdmin: true });
    expect(accessToken).toBeDefined();

    const res = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(testCodeSystem);
    expect(res.status).toEqual(201);
    codeSystem = res.body as CodeSystem;

    const res2 = await request(app)
      .post(`/fhir/R4/CodeSystem/$import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: codeSystem.url },
          { name: 'concept', valueCoding: { code: '1', display: 'Biopsy of brain' } },
          { name: 'concept', valueCoding: { code: '2', display: 'Biopsy of head' } },
        ],
      } as Parameters);
    expect(res2.status).toBe(200);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$validate-code')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: codeSystem.url },
          { name: 'code', valueCode: '1' },
        ],
      } as Parameters);
    expect(res.status).toEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        { name: 'result', valueBoolean: true },
        { name: 'display', valueString: 'Biopsy of brain' },
      ],
    });
  });

  test('Coding parameter', async () => {
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$validate-code')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system: codeSystem.url, code: '1' } }],
      } as Parameters);
    expect(res.status).toEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        { name: 'result', valueBoolean: true },
        { name: 'display', valueString: 'Biopsy of brain' },
      ],
    });
  });

  test('Not found', async () => {
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$validate-code')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'url', valueUri: codeSystem.url },
          { name: 'code', valueCode: 'wrong code' },
        ],
      } as Parameters);
    expect(res.status).toEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [{ name: 'result', valueBoolean: false }],
    });
  });

  test('No full coding specified', async () => {
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$validate-code')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'code', valueCode: 'wrong code' }],
      } as Parameters);
    expect(res.status).toEqual(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'No code system specified' } }],
    });
  });

  test('Checks project', async () => {
    const otherAccessToken = await initTestAuth();
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$validate-code')
      .set('Authorization', 'Bearer ' + otherAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system: codeSystem.url, code: '1' } }],
      } as Parameters);
    expect(res.status).toEqual(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: `CodeSystem ${codeSystem.url} not found` } }],
    });
  });

  test('Lookup using specific CodeSystem version', async () => {
    const updatedCodeSystem: CodeSystem = {
      ...testCodeSystem,
      content: 'complete',
      version: '3.1.4',
      concept: [{ code: '5', display: 'Neologism' }],
    };
    const res = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(updatedCodeSystem);
    expect(res.status).toEqual(201);
    const codeSystem = res.body as CodeSystem;

    const res2 = await request(app)
      .post('/fhir/R4/CodeSystem/$validate-code')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'coding', valueCoding: { system: codeSystem.url, code: '5' } },
          { name: 'version', valueString: '3.1.4' },
        ],
      } as Parameters);
    expect(res2.status).toEqual(200);
    expect(res2.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        { name: 'result', valueBoolean: true },
        { name: 'display', valueString: 'Neologism' },
      ],
    });
  });

  test('GET endpoint', async () => {
    const res = await request(app)
      .get(`/fhir/R4/CodeSystem/$validate-code?url=${codeSystem.url}&code=1`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send();
    expect(res.status).toEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        { name: 'result', valueBoolean: true },
        { name: 'display', valueString: 'Biopsy of brain' },
      ],
    });
  });

  test('GET instance endpoint', async () => {
    const res = await request(app)
      .get(`/fhir/R4/CodeSystem/${codeSystem.id}/$validate-code?code=1`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send();
    expect(res.status).toEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        { name: 'result', valueBoolean: true },
        { name: 'display', valueString: 'Biopsy of brain' },
      ],
    });
  });

  test('Fail on instance system URL mismatch', async () => {
    const res = await request(app)
      .get(`/fhir/R4/CodeSystem/${codeSystem.id}/$validate-code?url=incorrect&code=1`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send();
    expect(res.status).toEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [{ name: 'result', valueBoolean: false }],
    });
  });

  test('Instance endpoint with coding', async () => {
    const res = await request(app)
      .post(`/fhir/R4/CodeSystem/${codeSystem.id}/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { code: '1' } }],
      } as Parameters);
    expect(res.status).toEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        { name: 'result', valueBoolean: true },
        { name: 'display', valueString: 'Biopsy of brain' },
      ],
    });
  });

  test('Fail on instance coding system mismatch', async () => {
    const res = await request(app)
      .post(`/fhir/R4/CodeSystem/${codeSystem.id}/$validate-code`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system: 'incorrect', code: '1' } }],
      } as Parameters);
    expect(res.status).toEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [{ name: 'result', valueBoolean: false }],
    });
  });

  test('validateCodings', async () => {
    const result = await validateCodings(codeSystem, [
      { system: codeSystem.url, code: '1' }, // valid
      { system: codeSystem.url, code: '2' }, // valid
      { system: codeSystem.url, code: 'invalid-code' }, // invalid
      { system: 'incorrect-system', code: '1' }, // invalid
      { system: codeSystem.url, code: undefined }, // invalid
      { system: undefined, code: '1' }, // valid
      { system: undefined, code: 'invalid-code' }, // invalid
      { system: codeSystem.url, code: '2' }, // valid duplicate
    ]);
    expect(result).toMatchObject([
      { system: codeSystem.url, code: '1', display: 'Biopsy of brain' },
      { system: codeSystem.url, code: '2', display: 'Biopsy of head' },
      undefined,
      undefined,
      undefined,
      { system: codeSystem.url, code: '1', display: 'Biopsy of brain' },
      undefined,
      { system: codeSystem.url, code: '2', display: 'Biopsy of head' },
    ]);
  });
});
