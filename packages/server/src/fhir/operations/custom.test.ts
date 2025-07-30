import { ContentType, createReference, WithId } from '@medplum/core';
import { Bot } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { initTestAuth } from '../../test.setup';

describe('Custom operation', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    await initApp(app, config);
    accessToken = await initTestAuth();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing extension', async () => {
    // Test the case where there is an OperationDefinition,
    // but it does not have the required extension for a custom operation
    const res1 = await request(app)
      .post('/fhir/R4/OperationDefinition')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'OperationDefinition',
        name: 'missing-extension',
        status: 'active',
        kind: 'operation',
        code: 'missing-extension',
        system: true,
        type: false,
        instance: false,
        parameter: [
          {
            use: 'in',
            name: 'foo',
            type: 'string',
            min: 1,
            max: '1',
          },
          {
            use: 'out',
            name: 'bar',
            type: 'string',
            min: 1,
            max: '1',
          },
        ],
      });
    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/fhir/R4/Patient/$missing-extension')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res2.status).toBe(404);
  });

  test('Extension is not a bot', async () => {
    // Test the case where there is an OperationDefinition,
    // and the OperationDefinition does have the required extension,
    // but it does not reference a Bot resource
    const res3 = await request(app)
      .post('/fhir/R4/OperationDefinition')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'OperationDefinition',
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation',
            valueReference: { reference: 'foo' },
          },
        ],
        name: 'not-a-bot',
        status: 'active',
        kind: 'operation',
        code: 'not-a-bot',
        system: true,
        type: false,
        instance: false,
        parameter: [
          {
            use: 'in',
            name: 'foo',
            type: 'string',
            min: 1,
            max: '1',
          },
          {
            use: 'out',
            name: 'bar',
            type: 'string',
            min: 1,
            max: '1',
          },
        ],
      });
    expect(res3.status).toBe(201);

    const res4 = await request(app)
      .post('/fhir/R4/Patient/$not-a-bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res4.status).toBe(404);
  });

  test('Success', async () => {
    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Custom Operation Bot',
        runtimeVersion: 'vmcontext',
      });
    expect(res1.status).toBe(201);

    const bot = res1.body as WithId<Bot>;

    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        code: `
          exports.handler = async function (medplum, event) {
            const patient = event.input;
            patient.identifier = patient.identifier || [];
            patient.identifier.push({
              system: 'https://example.com/patient-id',
              value: '12345',
            });
            return patient;
          };
          `,
      });
    expect(res2.status).toBe(200);

    const res3 = await request(app)
      .post('/fhir/R4/OperationDefinition')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'OperationDefinition',
        extension: [
          {
            url: 'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation',
            valueReference: createReference(bot),
          },
        ],
        name: 'my-custom-operation',
        status: 'active',
        kind: 'operation',
        code: 'my-custom-operation',
        system: true,
        type: false,
        instance: false,
        parameter: [
          {
            use: 'in',
            name: 'foo',
            type: 'string',
            min: 1,
            max: '1',
          },
          {
            use: 'out',
            name: 'return',
            type: 'Patient',
            min: 1,
            max: '1',
          },
        ],
      });
    expect(res3.status).toBe(201);

    const res4 = await request(app)
      .post('/fhir/R4/Patient/$my-custom-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res4.status).toBe(200);
    expect(res4.body.resourceType).toBe('Patient');
    expect(res4.body.identifier).toBeDefined();
    expect(res4.body.identifier.length).toBe(1);
    expect(res4.body.identifier[0]).toMatchObject({
      system: 'https://example.com/patient-id',
      value: '12345',
    });
  });
});
