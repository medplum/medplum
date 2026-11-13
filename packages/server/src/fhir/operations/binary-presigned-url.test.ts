// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString } from '@medplum/core';
import type { AuditEvent, Binary, Parameters } from '@medplum/fhirtypes';
import express from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import { vi } from 'vitest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { ServerConfig } from '../../config/utils';
import { globalLogger } from '../../logger';
import { addTestUser, createTestProject, initTestAuth } from '../../test.setup';
import { OperationCodeSystem, OperationInteraction } from '../../util/auditevent';

const app = express();

describe('Binary/$presigned-url', () => {
  let accessToken: string;
  let config: ServerConfig;
  let server: Server;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initApp(app, config);

    // Manually bind the server to a port so it uses a consistent one for all requests
    server = app.listen();
  });

  beforeEach(async () => {
    accessToken = await initTestAuth();
    expect(accessToken).toBeDefined();
  });

  afterAll(async () => {
    await shutdownApp();

    // Manually close server so test can exit
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });

  test('Full write-read cycle', async () => {
    // Use same instance to ensure the same server hostname between multiple requests
    const testAgent = request(server);

    // Set the storage base URL to the same mock server base URL
    const baseUrl = testAgent.get('/').url;
    config.storageBaseUrl = baseUrl + 'storage/';

    const binRes = await testAgent
      .post('/fhir/R4/Binary')
      .auth(accessToken, { type: 'bearer' })
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Binary',
        contentType: 'text/plain',
      } satisfies Binary);
    expect(binRes).toHaveStatus(201);
    const binary = binRes.body as WithId<Binary>;

    const writeUrlRes = await testAgent
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url?upload=true`)
      .auth(accessToken, { type: 'bearer' })
      .send();
    expect(writeUrlRes).toHaveStatus(200);
    const writeResult = writeUrlRes.body as Parameters;
    const writeUrl = new URL(writeResult.parameter?.[0]?.valueUri as string);

    const uploadRes = await testAgent
      .put(writeUrl.pathname + writeUrl.search)
      .set('Content-Type', 'text/plain')
      .send('foo bar baz quux');
    expect(uploadRes).toHaveStatus(200);
  });

  test('Upload link identifies the project', async () => {
    const testAgent = request(server);
    config.storageBaseUrl = testAgent.get('/').url + 'storage/';
    const { project, accessToken } = await createTestProject({ withAccessToken: true });
    const binRes = await testAgent
      .post('/fhir/R4/Binary')
      .auth(accessToken, { type: 'bearer' })
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Binary', contentType: 'text/plain' } satisfies Binary);
    expect(binRes).toHaveStatus(201);

    const writeUrlRes = await testAgent
      .get(`/fhir/R4/Binary/${binRes.body.id}/$presigned-url?upload=true`)
      .auth(accessToken, { type: 'bearer' })
      .send();
    expect(writeUrlRes).toHaveStatus(200);
    const writeUrl = new URL((writeUrlRes.body as Parameters).parameter?.[0]?.valueUri as string);
    expect(writeUrl.searchParams.get('Project')).toBe(project.id);
  });

  test('Requires update permission to generate upload link', async () => {
    const { accessToken } = await createTestProject({
      withAccessToken: true,
      accessPolicy: {
        resource: [{ resourceType: 'Binary', interaction: ['create', 'read'] }],
      },
    });
    const binRes = await request(server)
      .post('/fhir/R4/Binary')
      .auth(accessToken, { type: 'bearer' })
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Binary',
        contentType: 'text/plain',
      } satisfies Binary);
    expect(binRes).toHaveStatus(201);
    const binary = binRes.body as WithId<Binary>;

    // Read URL should still be available
    const readUrlRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url`)
      .auth(accessToken, { type: 'bearer' })
      .send();
    expect(readUrlRes).toHaveStatus(200);

    // Write URL not permitted
    const writeUrlRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url?upload=true`)
      .auth(accessToken, { type: 'bearer' })
      .send();
    expect(writeUrlRes).toHaveStatus(403);
  });

  test('Upload link refused for readonly or hidden data field', async () => {
    const { project, accessToken: ownerToken } = await createTestProject({ withAccessToken: true });
    const binRes = await request(server)
      .post('/fhir/R4/Binary')
      .auth(ownerToken, { type: 'bearer' })
      .set('Content-Type', 'application/fhir+json')
      .send({ resourceType: 'Binary', contentType: 'text/plain' } satisfies Binary);
    expect(binRes).toHaveStatus(201);

    for (const fields of [{ readonlyFields: ['data'] }, { hiddenFields: ['data'] }]) {
      const { accessToken } = await addTestUser(project, {
        accessPolicy: { resourceType: 'AccessPolicy', resource: [{ resourceType: 'Binary', ...fields }] },
      });
      const writeUrlRes = await request(server)
        .get(`/fhir/R4/Binary/${binRes.body.id}/$presigned-url?upload=true`)
        .auth(accessToken, { type: 'bearer' })
        .send();
      expect(writeUrlRes).toHaveStatus(403);
    }
  });

  test('Linked project cannot generate upload link', async () => {
    const owner = await createTestProject({ withAccessToken: true });
    const linked = await createTestProject({
      withAccessToken: true,
      project: { link: [{ project: createReference(owner.project) }] },
    });

    const binRes = await request(server)
      .post('/fhir/R4/Binary')
      .auth(owner.accessToken, { type: 'bearer' })
      .set('Content-Type', 'application/fhir+json')
      .send({
        resourceType: 'Binary',
        contentType: 'text/plain',
      } satisfies Binary);
    expect(binRes).toHaveStatus(201);
    const binary = binRes.body as WithId<Binary>;

    // Owning project can upload
    const ownerWriteUrlRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url?upload=true`)
      .auth(owner.accessToken, { type: 'bearer' })
      .send();
    expect(ownerWriteUrlRes).toHaveStatus(200);

    // Linked project can read
    const linkedReadUrlRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url`)
      .auth(linked.accessToken, { type: 'bearer' })
      .send();
    expect(linkedReadUrlRes).toHaveStatus(200);

    // Linked project cannot upload
    const linkedWriteUrlRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url?upload=true`)
      .auth(linked.accessToken, { type: 'bearer' })
      .send();
    expect(linkedWriteUrlRes).toHaveStatus(403);
  });

  test('Upload link enforces access policy write constraints against the stored Binary', async () => {
    const { project, accessToken: ownerToken } = await createTestProject({ withAccessToken: true });
    const otherUser = await addTestUser(project, {
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [
          {
            resourceType: 'Binary',
            writeConstraint: [
              {
                language: 'text/fhirpath',
                expression: '%before.exists() implies %before.meta.author = %after.meta.author',
              },
              { language: 'text/fhirpath', expression: "%after.contentType = 'text/plain'" },
            ],
          },
        ],
      },
    });

    const createBinary = async (token: string, contentType: string): Promise<WithId<Binary>> => {
      const res = await request(server)
        .post('/fhir/R4/Binary')
        .auth(token, { type: 'bearer' })
        .set('Content-Type', 'application/fhir+json')
        .send({ resourceType: 'Binary', contentType } satisfies Binary);
      expect(res).toHaveStatus(201);
      return res.body as WithId<Binary>;
    };
    const textBinary = await createBinary(otherUser.accessToken, 'text/plain');
    const ownerTextBinary = await createBinary(ownerToken, 'text/plain');
    const pdfBinary = await createBinary(ownerToken, 'application/pdf');

    const writeSpy = vi.spyOn(globalLogger, 'write').mockImplementation(() => undefined);
    config.logAuditEvents = true;
    try {
      const textWriteUrlRes = await request(server)
        .get(`/fhir/R4/Binary/${textBinary.id}/$presigned-url?upload=true`)
        .auth(otherUser.accessToken, { type: 'bearer' })
        .send();
      expect(textWriteUrlRes).toHaveStatus(200);

      const pdfReadUrlRes = await request(server)
        .get(`/fhir/R4/Binary/${pdfBinary.id}/$presigned-url`)
        .auth(otherUser.accessToken, { type: 'bearer' })
        .send();
      expect(pdfReadUrlRes).toHaveStatus(200);

      const pdfWriteUrlRes = await request(server)
        .get(`/fhir/R4/Binary/${pdfBinary.id}/$presigned-url?upload=true`)
        .auth(otherUser.accessToken, { type: 'bearer' })
        .send();
      expect(pdfWriteUrlRes).toHaveStatus(403);

      // The upload is judged as an update by this user, which would change the author
      const ownerTextWriteUrlRes = await request(server)
        .get(`/fhir/R4/Binary/${ownerTextBinary.id}/$presigned-url?upload=true`)
        .auth(otherUser.accessToken, { type: 'bearer' })
        .send();
      expect(ownerTextWriteUrlRes).toHaveStatus(403);

      const operationEvents = writeSpy.mock.calls
        .map(([msg]) => JSON.parse(msg) as AuditEvent)
        .filter((event) => event.resourceType === 'AuditEvent' && event.subtype?.[0]?.code === 'operation');
      const operationSubtype = [
        OperationInteraction,
        { system: OperationCodeSystem, code: 'Binary/$presigned-url', display: 'Binary/$presigned-url' },
      ];
      expect(operationEvents).toMatchObject([
        {
          subtype: operationSubtype,
          action: 'E',
          outcome: '0',
          agent: [{ who: { reference: getReferenceString(otherUser.profile) }, requestor: true }],
          entity: [
            {
              what: { reference: getReferenceString(textBinary) },
              detail: [
                { type: 'versionId', valueString: textBinary.meta?.versionId },
                { type: 'upload', valueString: 'true' },
              ],
            },
          ],
        },
        {
          subtype: operationSubtype,
          action: 'E',
          outcome: '4',
          outcomeDesc: 'Forbidden',
          agent: [{ who: { reference: getReferenceString(otherUser.profile) }, requestor: true }],
          entity: [
            { what: { reference: getReferenceString(pdfBinary) }, detail: [{ type: 'upload', valueString: 'true' }] },
          ],
        },
        {
          subtype: operationSubtype,
          outcome: '4',
          entity: [{ what: { reference: getReferenceString(ownerTextBinary) } }],
        },
      ]);
    } finally {
      config.logAuditEvents = false;
      writeSpy.mockRestore();
    }
  });

  test('Requires securityContext read access to generate presigned URL', async () => {
    const testProject = await createTestProject({ withAccessToken: true });

    const patientRes = await request(server)
      .post('/fhir/R4/Patient')
      .auth(testProject.accessToken, { type: 'bearer' })
      .send({ resourceType: 'Patient' });
    expect(patientRes).toHaveStatus(201);

    const binaryRes = await request(server)
      .post('/fhir/R4/Binary')
      .auth(testProject.accessToken, { type: 'bearer' })
      .set('Content-Type', 'text/plain')
      .set('X-Security-Context', `Patient/${patientRes.body.id}`)
      .send('sensitive binary');
    expect(binaryRes).toHaveStatus(201);
    const binary = binaryRes.body as WithId<Binary>;

    // Restricted user: can read Binary, but not Patient (the securityContext target)
    const restrictedUser = await addTestUser(testProject.project, {
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Binary', interaction: ['read'] }],
      },
    });

    // Permitted user: can read Binary and Patient
    const permittedUser = await addTestUser(testProject.project, {
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Binary', interaction: ['read'] },
          { resourceType: 'Patient', interaction: ['read'] },
        ],
      },
    });

    // Confirm the restricted user cannot read the Patient
    const patientReadRes = await request(server)
      .get(`/fhir/R4/Patient/${patientRes.body.id}`)
      .auth(restrictedUser.accessToken, { type: 'bearer' });
    expect(patientReadRes).toHaveStatus(403);

    // Restricted user should be blocked from getting a presigned URL
    const restrictedPresignRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url`)
      .auth(restrictedUser.accessToken, { type: 'bearer' })
      .send();
    expect(restrictedPresignRes).toHaveStatus(403);

    // Permitted user with read access should succeed
    const permittedPresignRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url`)
      .auth(permittedUser.accessToken, { type: 'bearer' })
      .send();
    expect(permittedPresignRes).toHaveStatus(200);

    // Admin user with full access should succeed
    const authorizedPresignRes = await request(server)
      .get(`/fhir/R4/Binary/${binary.id}/$presigned-url`)
      .auth(testProject.accessToken, { type: 'bearer' })
      .send();
    expect(authorizedPresignRes).toHaveStatus(200);
  });
});
