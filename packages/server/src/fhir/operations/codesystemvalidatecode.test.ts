import { CodeSystem, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import { loadTestConfig } from '../../config';
import { initApp, shutdownApp } from '../../app';
import { initTestAuth } from '../../test.setup';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { ContentType } from '@medplum/core';

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
    console.log(res.body.issue);
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
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'No coding specified' } }],
    });
  });
});
