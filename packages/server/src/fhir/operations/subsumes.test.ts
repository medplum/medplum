import { Bundle, Parameters } from '@medplum/fhirtypes';
import { ContentType } from '@medplum/core';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config';
import { initTestAuth } from '../../test.setup';

const app = express();
const system = 'http://terminology.hl7.org/CodeSystem/v3-RoleCode';

describe('CodeSystem subsumes', () => {
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    accessToken = await initTestAuth({ superAdmin: true });
    expect(accessToken).toBeDefined();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Subsumes', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/CodeSystem/$subsumes`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: system },
          { name: 'codeA', valueCode: 'SIB' },
          { name: 'codeB', valueCode: 'ITWINBRO' },
        ],
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'outcome')?.valueCode).toBe('subsumes');
  });

  test('Subsumed by', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/CodeSystem/$subsumes`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: system },
          { name: 'codeA', valueCode: 'WIFE' },
          { name: 'codeB', valueCode: 'SIGOTHR' },
        ],
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'outcome')?.valueCode).toBe('subsumed-by');
  });

  test('Equivalent', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/CodeSystem/$subsumes`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: system },
          { name: 'codeA', valueCode: 'INLAW' },
          { name: 'codeB', valueCode: 'INLAW' },
        ],
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'outcome')?.valueCode).toBe('equivalent');
  });

  test('Not subsumed', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/CodeSystem/$subsumes`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: system },
          { name: 'codeA', valueCode: 'BRO' },
          { name: 'codeB', valueCode: 'VET' },
        ],
      } as Parameters);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'outcome')?.valueCode).toBe('not-subsumed');
  });

  test('Returns error on incomplete input', async () => {
    const res2 = await request(app)
      .post(`/fhir/R4/CodeSystem/$subsumes`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: system },
          { name: 'codeA', valueCode: 'SIB' },
        ],
      } as Parameters);
    expect(res2.status).toBe(400);
    expect(res2.body.resourceType).toEqual('OperationOutcome');
  });

  test('GET endpoint', async () => {
    const res2 = await request(app)
      .get(`/fhir/R4/CodeSystem/$subsumes?system=${system}&codeA=SIB&codeB=ITWINBRO`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'outcome')?.valueCode).toBe('subsumes');
  });

  test('GET instance endpoint', async () => {
    const res = await request(app)
      .get(`/fhir/R4/CodeSystem?url=${system}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toEqual('Bundle');
    const codeSystem = (res.body as Bundle).entry?.[0]?.resource;

    const res2 = await request(app)
      .get(`/fhir/R4/CodeSystem/${codeSystem?.id}/$subsumes?codeA=SIB&codeB=ITWINBRO`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON);
    expect(res2.status).toBe(200);
    expect(res2.body.resourceType).toEqual('Parameters');
    const output = res2.body as Parameters;
    expect(output.parameter?.find((p) => p.name === 'outcome')?.valueCode).toBe('subsumes');
  });
});
