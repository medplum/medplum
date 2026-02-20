// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, ContentType, createReference } from '@medplum/core';
import type { Bot, Patient } from '@medplum/fhirtypes';
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

  test('System-level custom operation', async () => {
    const resMissing = await request(app)
      .post('/fhir/R4/$my-system-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(resMissing.status).toBe(404);

    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'System Custom Operation Bot',
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
          exports.handler = async function () {
            return { result: 'ok' };
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
        name: 'my-system-operation',
        status: 'active',
        kind: 'operation',
        code: 'my-system-operation',
        system: true,
        type: false,
        instance: false,
        parameter: [
          {
            use: 'out',
            name: 'result',
            type: 'string',
            min: 1,
            max: '1',
          },
        ],
      });
    expect(res3.status).toBe(201);

    const res4 = await request(app)
      .post('/fhir/R4/$my-system-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res4.status).toBe(200);
    expect(res4.body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'result', valueString: 'ok' }],
    });
  });

  test('Error value returned all the way to the client', async () => {
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
          const { badRequest, OperationOutcomeError } = require('@medplum/core');
          exports.handler = async function (medplum, event) {
            throw new OperationOutcomeError(badRequest('test'));
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
        name: 'my-error-operation',
        status: 'active',
        kind: 'operation',
        code: 'my-error-operation',
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
      .post('/fhir/R4/Patient/$my-error-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res4.status).toBe(400);
    expect(res4.body).toMatchObject(badRequest('test'));
  });

  test('Helpful error if return type does not match', async () => {
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
          const { badRequest, OperationOutcomeError } = require('@medplum/core');
          exports.handler = async function (medplum, event) {
            return 'test string';
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
        name: 'my-return-type-operation',
        status: 'active',
        kind: 'operation',
        code: 'my-return-type-operation',
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
      .post('/fhir/R4/Patient/$my-return-type-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res4.status).toBe(400);
    expect(res4.body).toMatchObject(badRequest('Expected Patient output, but got unexpected string'));
  });

  test('Instance-level custom operation passes resource as input', async () => {
    // Create a Patient resource to operate on
    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Patient',
        name: [{ given: ['John'], family: 'Doe' }],
      });
    expect(patientRes.status).toBe(201);
    const patient = patientRes.body as WithId<Patient>;

    // Create a Bot that returns the input it receives
    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Bot',
        name: 'Instance Operation Bot',
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
            return event.input;
          };
          `,
      });
    expect(res2.status).toBe(200);

    // Create OperationDefinition with instance: true
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
        name: 'my-instance-operation',
        status: 'active',
        kind: 'operation',
        code: 'my-instance-operation',
        system: false,
        type: false,
        instance: true,
        parameter: [
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

    // Invoke the operation on the specific Patient
    const res4 = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$my-instance-operation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res4.status).toBe(200);
    expect(res4.body.resourceType).toBe('Patient');
    expect(res4.body.id).toBe(patient.id);
    expect(res4.body.name).toMatchObject([{ given: ['John'], family: 'Doe' }]);
  });

  test('Instance-level custom operation with non-existent resource returns 404', async () => {
    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Bot', name: 'Echo Bot', runtimeVersion: 'vmcontext' });
    expect(res1.status).toBe(201);
    const bot = res1.body as WithId<Bot>;

    await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: `exports.handler = async function (medplum, event) { return event.input; };` });

    await request(app)
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
        name: 'my-notfound-instance-operation',
        status: 'active',
        kind: 'operation',
        code: 'my-notfound-instance-operation',
        system: false,
        type: false,
        instance: true,
        parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }],
      });

    const res = await request(app)
      .post('/fhir/R4/Patient/non-existent-id/$my-notfound-instance-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res.status).toBe(404);
  });

  test('GET request on instance-level operation loads resource as input', async () => {
    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient', name: [{ given: ['Jane'], family: 'Smith' }] });
    expect(patientRes.status).toBe(201);
    const patient = patientRes.body as WithId<Patient>;

    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Bot', name: 'GET Instance Bot', runtimeVersion: 'vmcontext' });
    expect(res1.status).toBe(201);
    const bot = res1.body as WithId<Bot>;

    await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: `exports.handler = async function (medplum, event) { return event.input; };` });

    await request(app)
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
        name: 'my-get-instance-operation',
        status: 'active',
        kind: 'operation',
        code: 'my-get-instance-operation',
        system: false,
        type: false,
        instance: true,
        parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }],
      });

    // GET request should still pass the resource as input
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$my-get-instance-operation`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toBe('Patient');
    expect(res.body.id).toBe(patient.id);
    expect(res.body.name).toMatchObject([{ given: ['Jane'], family: 'Smith' }]);
  });

  test('Type-level operation invoked at instance URL uses request body, not resource', async () => {
    // Create a real Patient in the DB with a known family name
    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient', name: [{ given: ['Bob'], family: 'Jones' }] });
    expect(patientRes.status).toBe(201);
    const patient = patientRes.body as WithId<Patient>;

    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Bot', name: 'Type Level Bot', runtimeVersion: 'vmcontext' });
    expect(res1.status).toBe(201);
    const bot = res1.body as WithId<Bot>;

    await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: `exports.handler = async function (medplum, event) { return event.input; };` });

    await request(app)
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
        name: 'my-type-only-operation',
        status: 'active',
        kind: 'operation',
        code: 'my-type-only-operation',
        system: false,
        type: true,
        instance: false,
        parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }],
      });

    // Send a different Patient in the body — the bot should receive this, not the DB Patient
    const bodyPatient = { resourceType: 'Patient', name: [{ family: 'FromBody' }] };
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$my-type-only-operation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(bodyPatient);
    expect(res.status).toBe(200);
    // Bot received the request body (not the DB Patient), so family should be 'FromBody' not 'Jones'
    expect(res.body.resourceType).toBe('Patient');
    expect(res.body.name).toMatchObject([{ family: 'FromBody' }]);
    expect(res.body.id).toBeUndefined();
  });
});
