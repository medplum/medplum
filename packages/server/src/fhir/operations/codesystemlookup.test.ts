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
  property: [
    {
      code: 'parent',
      uri: 'http://hl7.org/fhir/concept-properties#parent',
      description: 'Test parent property',
      type: 'code',
    },
  ],
};

describe('CodeSystem lookup', () => {
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
          { name: 'concept', valueCoding: { code: '3', display: 'Procedure on head' } },
          { name: 'concept', valueCoding: { code: '4', display: 'Procedure' } },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: '1' },
              { name: 'property', valueCode: 'parent' },
              { name: 'value', valueString: '2' },
            ],
          },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: '1' },
              { name: 'property', valueCode: 'parent' },
              { name: 'value', valueString: '3' },
            ],
          },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: '1' },
              { name: 'property', valueCode: 'parent' },
              { name: 'value', valueString: '4' },
            ],
          },
        ],
      } as Parameters);
    expect(res2.status).toBe(200);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$lookup')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: codeSystem.url },
          { name: 'code', valueCode: '1' },
        ],
      } as Parameters);
    expect(res.status).toEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        { name: 'name', valueString: 'Test Code System' },
        { name: 'display', valueString: 'Biopsy of brain' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: '2' },
            { name: 'description', valueString: 'Test parent property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: '3' },
            { name: 'description', valueString: 'Test parent property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: '4' },
            { name: 'description', valueString: 'Test parent property' },
          ],
        },
      ],
    });
  });

  test('Coding parameter', async () => {
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$lookup')
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
        { name: 'name', valueString: 'Test Code System' },
        { name: 'display', valueString: 'Biopsy of brain' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: '2' },
            { name: 'description', valueString: 'Test parent property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: '3' },
            { name: 'description', valueString: 'Test parent property' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: '4' },
            { name: 'description', valueString: 'Test parent property' },
          ],
        },
      ],
    });
  });

  test('Not found', async () => {
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$lookup')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: codeSystem.url },
          { name: 'code', valueCode: 'wrong code' },
        ],
      } as Parameters);
    expect(res.status).toEqual(404);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', details: { text: 'Not found' } }],
    });
  });

  test('No full coding specified', async () => {
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$lookup')
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
