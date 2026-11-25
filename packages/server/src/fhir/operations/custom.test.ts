// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, ContentType, createReference, getReferenceString, Logger, parseJWTPayload } from '@medplum/core';
import type { Bot, OperationDefinition, Patient, Project } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { addTestUser, createBotMembership, createTestProject, withTestContext } from '../../test.setup';

const IMPLEMENTATION_URL = 'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation';

describe('Custom operation', () => {
  const app = express();
  let accessToken: string;
  let project: WithId<Project>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.vmContextBotsEnabled = true;
    await initApp(app, config);
    ({ project, accessToken } = await createTestProject({ withAccessToken: true, membership: { admin: true } }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  /**
   * Creates an OperationDefinition named `code`. Defaults to a system-level operation with no parameters.
   * @param code - The operation code.
   * @param operation - Overrides for the OperationDefinition.
   */
  async function createOperation(code: string, operation?: Partial<OperationDefinition>): Promise<void> {
    const res = await request(app)
      .post('/fhir/R4/OperationDefinition')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'OperationDefinition',
        name: code,
        status: 'active',
        kind: 'operation',
        code,
        system: true,
        type: false,
        instance: false,
        parameter: [],
        ...operation,
      });
    expect(res).toHaveStatus(201);
  }

  /**
   * Creates and deploys a Bot with its ProjectMembership, and an OperationDefinition named `code` it implements.
   * @param code - The operation code.
   * @param handler - The Bot's executable code.
   * @param operation - Overrides for the OperationDefinition.
   * @returns The Bot.
   */
  async function createBotOperation(
    code: string,
    handler: string,
    operation?: Partial<OperationDefinition>
  ): Promise<WithId<Bot>> {
    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Bot', name: code, runtimeVersion: 'vmcontext' });
    expect(res1).toHaveStatus(201);
    const bot = res1.body as WithId<Bot>;
    await createBotMembership(project, bot);

    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ code: handler });
    expect(res2).toHaveStatus(200);

    await createOperation(code, {
      extension: [{ url: IMPLEMENTATION_URL, valueReference: createReference(bot) }],
      ...operation,
    });
    return bot;
  }

  test('Missing extension', async () => {
    // Test the case where there is an OperationDefinition,
    // but it does not have the required extension for a custom operation
    await createOperation('missing-extension');

    const res = await request(app)
      .post('/fhir/R4/Patient/$missing-extension')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res).toHaveStatus(404);
  });

  test('Extension is not a bot', async () => {
    // Test the case where there is an OperationDefinition,
    // and the OperationDefinition does have the required extension,
    // but it does not reference a Bot resource
    await createOperation('not-a-bot', {
      extension: [{ url: IMPLEMENTATION_URL, valueReference: { reference: 'foo' } }],
    });

    const res = await request(app)
      .post('/fhir/R4/Patient/$not-a-bot')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res).toHaveStatus(404);
  });

  test('Success', async () => {
    await createBotOperation(
      'my-custom-operation',
      `
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
      { parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }] }
    );

    const res = await request(app)
      .post('/fhir/R4/Patient/$my-custom-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res).toHaveStatus(200);
    expect(res.body.resourceType).toBe('Patient');
    expect(res.body.identifier).toBeDefined();
    expect(res.body.identifier.length).toBe(1);
    expect(res.body.identifier[0]).toMatchObject({
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
    expect(resMissing).toHaveStatus(404);

    await createBotOperation('my-system-operation', `exports.handler = async () => ({ result: 'ok' });`, {
      parameter: [{ use: 'out', name: 'result', type: 'string', min: 1, max: '1' }],
    });

    const res = await request(app)
      .post('/fhir/R4/$my-system-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res).toHaveStatus(200);
    expect(res.body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'result', valueString: 'ok' }],
    });
  });

  test('Bot run by a caller with SMART scopes is logged', async () => {
    const { project, accessToken: adminToken } = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
    });

    const res1 = await request(app)
      .post('/fhir/R4/Bot')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ resourceType: 'Bot', name: 'Scope Operation Bot', runtimeVersion: 'vmcontext', runAsUser: true });
    expect(res1).toHaveStatus(201);
    const bot = res1.body as WithId<Bot>;

    const res2 = await request(app)
      .post(`/fhir/R4/Bot/${bot.id}/$deploy`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ code: `exports.handler = async (medplum) => ({ token: medplum.getAccessToken() });` });
    expect(res2).toHaveStatus(200);

    const res3 = await request(app)
      .post('/fhir/R4/OperationDefinition')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        resourceType: 'OperationDefinition',
        extension: [{ url: IMPLEMENTATION_URL, valueReference: createReference(bot) }],
        name: 'scope-operation',
        status: 'active',
        kind: 'operation',
        code: 'scope-operation',
        system: true,
        type: false,
        instance: false,
        parameter: [{ use: 'out', name: 'token', type: 'string', min: 1, max: '1' }],
      });
    expect(res3).toHaveStatus(201);

    const scope = 'openid user/Bot.rs user/OperationDefinition.rs';
    const user = await withTestContext(() => addTestUser(project, { scope }));
    const warnSpy = vi.spyOn(Logger.prototype, 'warn');
    try {
      const res4 = await request(app)
        .post('/fhir/R4/$scope-operation')
        .set('Authorization', 'Bearer ' + user.accessToken)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({});
      expect(res4).toHaveStatus(200);
      expect(parseJWTPayload(res4.body.parameter[0].valueString).scope).toBe('openid');

      const calls = warnSpy.mock.calls.filter(([msg]) => msg === 'Bot ran as a caller with SMART scopes');
      expect(calls.map(([, data]) => data)).toStrictEqual([
        {
          botId: bot.id,
          runAsProject: project.id,
          callerMembership: getReferenceString(user.membership),
          callerProfile: getReferenceString(user.profile),
          scope,
          launch: undefined,
          entryPoint: 'custom-operation',
          suppressed: 0,
        },
      ]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('Returns Parameters from bot unchanged', async () => {
    await createBotOperation(
      'my-parameters-operation',
      `
      exports.handler = async function () {
        return {
          resourceType: 'Parameters',
          parameter: [{ name: 'message', valueString: 'hello' }],
        };
      };
      `,
      { parameter: [{ use: 'out', name: 'result', type: 'boolean', min: 1, max: '1' }] }
    );

    const res = await request(app)
      .post('/fhir/R4/$my-parameters-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res).toHaveStatus(200);
    expect(res.body).toEqual({
      resourceType: 'Parameters',
      parameter: [{ name: 'message', valueString: 'hello' }],
    });
  });

  test('Binary without data is not returned', async () => {
    await createBotOperation(
      'my-binary-operation',
      `exports.handler = async () => ({ resourceType: 'Binary', contentType: 'text/plain', id: 'x', meta: { versionId: 'y' } });`,
      { parameter: [{ use: 'out', name: 'return', type: 'Binary', min: 1, max: '1' }] }
    );

    const res = await request(app)
      .post('/fhir/R4/$my-binary-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res).toHaveStatus(400);
    expect(res.body.issue[0].details.text).toStrictEqual('Bot returned a Binary without data');
  });

  test('Request headers passed to bot without Authorization', async () => {
    await createBotOperation(
      'headers-operation',
      'exports.handler = async (medplum, event) => ({ headers: JSON.stringify(event.headers) });',
      { parameter: [{ use: 'out', name: 'headers', type: 'string', min: 1, max: '1' }] }
    );

    const res = await request(app)
      .post('/fhir/R4/$headers-operation')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Cookie', 'session=abc')
      .set('X-Test', 'test')
      .send({});
    expect(res).toHaveStatus(200);
    const headers = JSON.parse(res.body.parameter[0].valueString);
    expect(headers['x-test']).toBe('test');
    expect(headers.authorization).toBeUndefined();
    expect(headers.cookie).toBe('session=abc');
  });

  test('Error value returned all the way to the client', async () => {
    await createBotOperation(
      'my-error-operation',
      `
      const { badRequest, OperationOutcomeError } = require('@medplum/core');
      exports.handler = async function () {
        throw new OperationOutcomeError(badRequest('test'));
      };
      `,
      { parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }] }
    );

    const res = await request(app)
      .post('/fhir/R4/Patient/$my-error-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject(badRequest('test'));
  });

  test('Helpful error if return type does not match', async () => {
    await createBotOperation('my-return-type-operation', `exports.handler = async () => 'test string';`, {
      parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }],
    });

    const res = await request(app)
      .post('/fhir/R4/Patient/$my-return-type-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject(badRequest('Expected Patient output, but got unexpected string'));
  });

  test('Instance-level custom operation passes resource as input', async () => {
    // Create a Patient resource to operate on
    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient', name: [{ given: ['John'], family: 'Doe' }] });
    expect(patientRes).toHaveStatus(201);
    const patient = patientRes.body as WithId<Patient>;

    await createBotOperation('my-instance-operation', `exports.handler = async (medplum, event) => event.input;`, {
      system: false,
      instance: true,
      parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }],
    });

    // Invoke the operation on the specific Patient
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$my-instance-operation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res).toHaveStatus(200);
    expect(res.body.resourceType).toBe('Patient');
    expect(res.body.id).toBe(patient.id);
    expect(res.body.name).toMatchObject([{ given: ['John'], family: 'Doe' }]);
  });

  test('Instance-level custom operation with non-existent resource returns 404', async () => {
    await createBotOperation(
      'my-notfound-instance-operation',
      `exports.handler = async (medplum, event) => event.input;`,
      {
        system: false,
        instance: true,
        parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }],
      }
    );

    const res = await request(app)
      .post('/fhir/R4/Patient/non-existent-id/$my-notfound-instance-operation')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({});
    expect(res).toHaveStatus(404);
  });

  test('Bot.rawBody selects raw or parsed body input', async () => {
    const bot = await createBotOperation(
      'my-raw-body-operation',
      `
      exports.handler = async function (medplum, event) {
        return { result: typeof event.input === 'string' ? event.input : JSON.stringify(event.input) };
      };
      `,
      {
        resource: ['Patient'],
        type: true,
        parameter: [{ use: 'out', name: 'result', type: 'string', min: 1, max: '1' }],
      }
    );

    const rawBody = '{ "value": 1.00 }\n';
    for (const enabled of [false, true]) {
      const updateRes = await request(app)
        .patch(`/fhir/R4/Bot/${bot.id}`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('Content-Type', ContentType.JSON_PATCH)
        .send([{ op: 'add', path: '/rawBody', value: enabled }]);
      expect(updateRes).toHaveStatus(200);

      for (const url of ['/fhir/R4/$my-raw-body-operation', '/fhir/R4/Patient/$my-raw-body-operation']) {
        const res = await request(app)
          .post(url)
          .set('Authorization', 'Bearer ' + accessToken)
          .set('Content-Type', ContentType.JSON)
          .send(rawBody);
        expect(res).toHaveStatus(200);
        expect(res.body.parameter).toStrictEqual([{ name: 'result', valueString: enabled ? rawBody : '{"value":1}' }]);
      }
    }
  });

  test('GET request on instance-level operation loads resource as input', async () => {
    const patientRes = await request(app)
      .post('/fhir/R4/Patient')
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient', name: [{ given: ['Jane'], family: 'Smith' }] });
    expect(patientRes).toHaveStatus(201);
    const patient = patientRes.body as WithId<Patient>;

    await createBotOperation('my-get-instance-operation', `exports.handler = async (medplum, event) => event.input;`, {
      system: false,
      instance: true,
      parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }],
    });

    // GET request should still pass the resource as input
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}/$my-get-instance-operation`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(200);
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
    expect(patientRes).toHaveStatus(201);
    const patient = patientRes.body as WithId<Patient>;

    await createBotOperation('my-type-only-operation', `exports.handler = async (medplum, event) => event.input;`, {
      system: false,
      type: true,
      parameter: [{ use: 'out', name: 'return', type: 'Patient', min: 1, max: '1' }],
    });

    // Send a different Patient in the body — the bot should receive this, not the DB Patient
    const bodyPatient = { resourceType: 'Patient', name: [{ family: 'FromBody' }] };
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patient.id}/$my-type-only-operation`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send(bodyPatient);
    expect(res).toHaveStatus(200);
    // Bot received the request body (not the DB Patient), so family should be 'FromBody' not 'Jones'
    expect(res.body.resourceType).toBe('Patient');
    expect(res.body.name).toMatchObject([{ family: 'FromBody' }]);
    expect(res.body.id).toBeUndefined();
  });
});
