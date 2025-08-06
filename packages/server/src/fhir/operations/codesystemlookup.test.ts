// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import { CodeSystem, OperationOutcome, Parameters } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

const app = express();

const testCodeSystem: CodeSystem = {
  resourceType: 'CodeSystem',
  url: 'http://example.com/test-code-system-' + randomUUID(),
  name: 'testCodeSystem',
  title: 'Test Code System',
  status: 'active',
  hierarchyMeaning: 'is-a',
  content: 'complete',
  property: [
    {
      code: 'parent',
      uri: 'http://hl7.org/fhir/concept-properties#parent',
      description: 'Test parent property',
      type: 'code',
    },
    {
      code: 'abstract',
      uri: 'http://hl7.org/fhir/concept-properties#notSelectable',
      description: 'Code is not a real thing',
      type: 'boolean',
    },
    {
      code: 'publishedOn',
      type: 'dateTime',
    },
    {
      code: 'rank',
      type: 'integer',
    },
  ],
  concept: [
    {
      code: '4',
      display: 'Procedure',
      concept: [
        {
          code: '3',
          display: 'Procedure on head',
          concept: [
            {
              code: '2',
              display: 'Biopsy of head',
              concept: [{ code: '1', display: 'Biopsy of brain' }],
              property: [
                {
                  code: 'abstract',
                  valueBoolean: true,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('CodeSystem lookup', () => {
  let codeSystem: CodeSystem;
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    accessToken = await initTestAuth({ membership: { admin: true } });
    expect(accessToken).toBeDefined();

    const res = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(testCodeSystem);
    expect(res.status).toStrictEqual(201);
    codeSystem = res.body as CodeSystem;
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
    expect(res.status).toStrictEqual(200);
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
            { name: 'description', valueString: 'Biopsy of head' },
          ],
        },
      ],
    });
  });

  test('Renders description for relationship and simple properties', async () => {
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$lookup')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'system', valueUri: codeSystem.url },
          { name: 'code', valueCode: '2' },
        ],
      } as Parameters);
    expect(res.status).toStrictEqual(200);
    expect(res.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: expect.arrayContaining([
        { name: 'name', valueString: 'Test Code System' },
        { name: 'display', valueString: 'Biopsy of head' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: '3' },
            { name: 'description', valueString: 'Procedure on head' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'abstract' },
            { name: 'value', valueBoolean: true },
            { name: 'description', valueString: 'Code is not a real thing' },
          ],
        },
      ]),
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
    expect(res.status).toStrictEqual(200);
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
            { name: 'description', valueString: 'Biopsy of head' },
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
    expect(res.status).toStrictEqual(404);
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
        parameter: [{ name: 'code', valueCode: '1' }],
      } as Parameters);
    expect(res.status).toStrictEqual(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: 'No code system specified' } }],
    });
  });

  test('Checks project', async () => {
    const otherAccessToken = await initTestAuth();
    const res = await request(app)
      .post('/fhir/R4/CodeSystem/$lookup')
      .set('Authorization', 'Bearer ' + otherAccessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system: codeSystem.url, code: '1' } }],
      } as Parameters);
    expect(res.status).toStrictEqual(400);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'invalid', details: { text: `CodeSystem ${codeSystem.url} not found` } }],
    });
  });

  test('Lookup using specific CodeSystem version', async () => {
    const updatedCodeSystem: CodeSystem = {
      ...testCodeSystem,
      version: '3.1.4',
      concept: [{ code: '5', display: 'Neologism' }],
    };
    const res = await request(app)
      .post('/fhir/R4/CodeSystem')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(updatedCodeSystem);
    expect(res.status).toStrictEqual(201);
    const codeSystem = res.body as CodeSystem;

    const res2 = await request(app)
      .post('/fhir/R4/CodeSystem/$lookup')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'coding', valueCoding: { system: codeSystem.url, code: '5' } },
          { name: 'version', valueString: '3.1.4' },
        ],
      } as Parameters);
    expect(res2.status).toStrictEqual(200);
    expect(res2.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: [
        { name: 'name', valueString: 'Test Code System' },
        { name: 'display', valueString: 'Neologism' },
      ],
    });
  });

  test('GET endpoint', async () => {
    const res = await request(app)
      .get(`/fhir/R4/CodeSystem/$lookup?system=${testCodeSystem.url}&code=1`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send();
    expect(res.status).toStrictEqual(200);
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
            { name: 'description', valueString: 'Biopsy of head' },
          ],
        },
      ],
    });
  });

  test('GET instance endpoint', async () => {
    const res = await request(app)
      .get(`/fhir/R4/CodeSystem/${codeSystem.id}/$lookup?code=1`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send();
    expect(res.status).toStrictEqual(200);
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
            { name: 'description', valueString: 'Biopsy of head' },
          ],
        },
      ],
    });
  });

  test('Error on instance system URL mismatch', async () => {
    const res = await request(app)
      .get(`/fhir/R4/CodeSystem/${codeSystem.id}/$lookup?system=incorrect&code=1`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send();
    expect(res.status).toStrictEqual(404);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', details: { text: 'Not found' } }],
    });
  });

  test('Instance endpoint with coding', async () => {
    const res = await request(app)
      .post(`/fhir/R4/CodeSystem/${codeSystem.id}/$lookup`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { code: '1' } }],
      } as Parameters);
    expect(res.status).toStrictEqual(200);
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
            { name: 'description', valueString: 'Biopsy of head' },
          ],
        },
      ],
    });
  });

  test('Error on instance coding system mismatch', async () => {
    const res = await request(app)
      .post(`/fhir/R4/CodeSystem/${codeSystem.id}/$lookup`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'coding', valueCoding: { system: 'incorrect', code: '1' } }],
      } as Parameters);
    expect(res.status).toStrictEqual(404);
    expect(res.body).toMatchObject<OperationOutcome>({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'not-found', details: { text: 'Not found' } }],
    });
  });

  test('Correctly renders imported properties of different types', async () => {
    const res = await request(app)
      .post(`/fhir/R4/CodeSystem/${codeSystem.id}/$import`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: '1' },
              { name: 'property', valueCode: 'abstract' },
              { name: 'value', valueString: 'false' },
            ],
          },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: '1' },
              { name: 'property', valueCode: 'publishedOn' },
              { name: 'value', valueString: '2020-01-01' },
            ],
          },
          {
            name: 'property',
            part: [
              { name: 'code', valueCode: '1' },
              { name: 'property', valueCode: 'rank' },
              { name: 'value', valueString: '418' },
            ],
          },
        ],
      } as Parameters);
    expect(res.status).toBe(200);

    const res2 = await request(app)
      .post(`/fhir/R4/CodeSystem/${codeSystem.id}/$lookup`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Parameters',
        parameter: [{ name: 'code', valueCode: '1' }],
      } as Parameters);
    expect(res2.status).toStrictEqual(200);
    expect(res2.body).toMatchObject<Parameters>({
      resourceType: 'Parameters',
      parameter: expect.arrayContaining([
        { name: 'name', valueString: 'Test Code System' },
        { name: 'display', valueString: 'Biopsy of brain' },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'parent' },
            { name: 'value', valueCode: '2' },
            { name: 'description', valueString: 'Biopsy of head' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'abstract' },
            { name: 'value', valueBoolean: false },
            { name: 'description', valueString: 'Code is not a real thing' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'publishedOn' },
            { name: 'value', valueDateTime: '2020-01-01' },
          ],
        },
        {
          name: 'property',
          part: [
            { name: 'code', valueCode: 'rank' },
            { name: 'value', valueInteger: 418 },
          ],
        },
      ]),
    });
  });
});
