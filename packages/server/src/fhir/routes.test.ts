// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, getReferenceString, WithId } from '@medplum/core';
import { Bundle, Meta, Organization, Patient, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import { DatabaseMode, getDatabasePool } from '../database';
import { addTestUser, bundleContains, createTestProject, initTestAuth, withTestContext } from '../test.setup';

const app = express();
let accessToken: string;
let legacyJsonResponseAccessToken: string;
let searchOnReaderAccessToken: string;
let testPatient: WithId<Patient>;
let patientId: string;
let patientVersionId: string;

describe('FHIR Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    accessToken = await initTestAuth();
    legacyJsonResponseAccessToken = await initTestAuth({
      project: { systemSetting: [{ name: 'legacyFhirJsonResponseFormat', valueBoolean: true }] },
    });
    searchOnReaderAccessToken = await initTestAuth({
      project: { systemSetting: [{ name: 'searchOnReader', valueBoolean: true }] },
    });

    for (const token of [accessToken, searchOnReaderAccessToken]) {
      const res = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + token)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Patient',
          name: [
            {
              given: ['Alice'],
              family: 'Smith',
            },
          ],
        });
      expect(res.status).toBe(201);
      if (token === accessToken) {
        testPatient = res.body as WithId<Patient>;
        patientId = testPatient.id;
        patientVersionId = (testPatient.meta as Meta).versionId as string;
      }
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Get CapabilityStatement anonymously', async () => {
    const res = await request(app).get(`/fhir/R4/metadata`);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('CapabilityStatement');
  });

  test('Get CapabilityStatement authenticated', async () => {
    const res = await request(app)
      .get(`/fhir/R4/metadata`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.body.resourceType).toStrictEqual('CapabilityStatement');
  });

  test('Get versions anonymously', async () => {
    const res = await request(app).get(`/fhir/R4/$versions`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ versions: ['4.0'], default: '4.0' });
  });

  test('Get SMART-on-FHIR configuration', async () => {
    const res = await request(app).get(`/fhir/R4/.well-known/smart-configuration`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toStrictEqual('application/json; charset=utf-8');

    // Required fields: https://build.fhir.org/ig/HL7/smart-app-launch/conformance.html#response
    expect(res.body.authorization_endpoint).toMatch(/\/oauth2\/authorize$/);
    expect(res.body.grant_types_supported).toEqual(
      expect.arrayContaining(['authorization_code', 'refresh_token', 'client_credentials'])
    );
    expect(res.body.token_endpoint).toMatch(/\/oauth2\/token$/);
    expect(res.body.capabilities).toBeDefined();
    expect(res.body.code_challenge_methods_supported).toEqual(expect.arrayContaining(['S256']));

    // Additional fields
    expect(res.body.introspection_endpoint).toMatch(/\/oauth2\/introspect$/);

    const res2 = await request(app).get(`/fhir/R4/.well-known/smart-styles.json`);
    expect(res2.status).toBe(200);
    expect(res2.headers['content-type']).toStrictEqual('application/json; charset=utf-8');
  });

  test('Invalid JSON', async () => {
    const res = await request(app)
      .post(`/fhir/R4/`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send('not-json');
    expect(res.status).toBe(400);
  });

  test.each<['standard' | 'legacy']>([['standard'], ['legacy']])(
    'Create resource success with %s FHIR JSON response format',
    async (jsonFormat) => {
      const patientToCreate: Patient = { resourceType: 'Patient', identifier: [] };
      const token = jsonFormat === 'standard' ? accessToken : legacyJsonResponseAccessToken;

      const res = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + token)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send(patientToCreate);
      expect(res.status).toBe(201);
      expect(res.body.resourceType).toStrictEqual('Patient');
      expect(res.headers.location).toContain('Patient');
      expect(res.headers.location).toContain(res.body.id);
      const patient = res.body;
      const res2 = await request(app)
        .get(`/fhir/R4/Patient/` + patient.id)
        .set('Authorization', 'Bearer ' + token);
      expect(res2.status).toBe(200);
      if (jsonFormat === 'standard') {
        expect(patient.identifier).toBeUndefined();
      } else {
        expect(patient.identifier).toStrictEqual([]);
      }
    }
  );

  test('Create resource invalid resource type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patientx`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patientx' });
    expect(res.status).toBe(400);
  });

  test('Create resource incorrect resource type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patientx' });
    expect(res.status).toBe(400);
  });

  test('Create resource invalid content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Read resource', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
  });

  test('Read resource _pretty', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}?_pretty=true`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    expect(res.text).toStrictEqual(JSON.stringify(res.body, undefined, 2));
  });

  test('Read resource invalid UUID', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource invalid resource type', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patientx/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Read resource not found', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/8a54c7db-654b-4c3d-ba85-e0909f51c12c`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource minimal', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Prefer', 'return=minimal');
    expect(res.status).toBe(200);
    expect(res.text).toStrictEqual('');
  });

  test('Read resource history', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}/_history`)
      .query({ _count: 2, _offset: '0' })
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);
    const bundle = res.body as Bundle;
    expect(bundle.entry).toBeDefined();
    expect(bundle.entry).toHaveLength(1);
  });

  test('Read resource history invalid UUID', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/123/_history`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource history invalid resource type', async () => {
    const res = await request(app)
      .get(`/fhir/R4/xyz/${patientId}/_history`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Read resource version', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}/_history/${patientVersionId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    // Expect "ETag" header to start with "W/" (weak validator)
    expect(res.headers.etag).toBeDefined();
    expect(res.headers.etag).toContain('W/');
  });

  test('Read resource version invalid UUID', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/123/_history/${patientVersionId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource version invalid version UUID', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}/_history/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Read resource version invalid resource type', async () => {
    const res = await request(app)
      .get(`/fhir/R4/xyz/${patientId}/_history/${patientVersionId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Read resource version not found', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patient/${patientId}/_history/${randomUUID()}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Update resource', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .put(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ ...patient, active: true });
    expect(res2.status).toBe(200);
  });

  test('Update resource not modified', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .put(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send(patient);
    expect(res2.status).toBe(200);
    expect(res2.body.meta.versionId).toStrictEqual(patient.meta.versionId);
  });

  test('Update resource not modified with empty strings', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        managingOrganization: {
          reference: 'Organization/123',
        },
      });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .put(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        ...patient,
        managingOrganization: {
          reference: 'Organization/123',
          display: '',
        },
      });
    expect(res2.status).toBe(200);
    expect(res2.body.meta.versionId).toStrictEqual(patient.meta.versionId);
  });

  test('Update resource invalid', async () => {
    const res = await request(app)
      .put(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res.status).toBe(400);
  });

  test('Update resource wrong content-type', async () => {
    const res = await request(app)
      .put(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Update resource missing ID', async () => {
    const res = await request(app)
      .put(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(400);
  });

  test('Update resource not found', async () => {
    const res = await request(app)
      .put(`/fhir/R4/Patient/${randomUUID()}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(400);
  });

  test('Update resource with precondition', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .put(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('If-Match', 'W/"' + patient.meta?.versionId + '"')
      .send({ ...patient, active: true });
    expect(res2.status).toBe(200);
  });

  test('Update resource with failed precondition', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .put(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('If-Match', 'W/"bad-id"')
      .send({ ...patient, active: true });
    expect(res2.status).toBe(412);
  });

  test('Delete resource', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(201);
    const patient = res.body;
    const res2 = await request(app)
      .delete(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    const res3 = await request(app)
      .get(`/fhir/R4/Patient/${patient.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(410);
  });

  test('Delete resource invalid UUID', async () => {
    const res = await request(app)
      .delete(`/fhir/R4/Patient/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(404);
  });

  test('Delete resource invalid resource type', async () => {
    const res = await request(app)
      .delete(`/fhir/R4/xyz/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Patch resource not found', async () => {
    const res = await request(app)
      .patch(`/fhir/R4/Patient/${randomUUID()}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON_PATCH)
      .send([
        {
          op: 'add',
          path: '/generalPractitioner',
          value: [{ reference: 'Practitioner/123' }],
        },
      ]);
    expect(res.status).toBe(404);
  });

  test('Patch resource wrong content type', async () => {
    const res = await request(app)
      .patch(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Patch resource invalid result', async () => {
    const res = await request(app)
      .patch(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON_PATCH)
      .send([{ op: 'remove', path: '/resourceType' }]);
    expect(res.status).toBe(400);
  });

  test('Patch resource success', async () => {
    const res = await request(app)
      .patch(`/fhir/R4/Patient/${patientId}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON_PATCH)
      .send([
        {
          op: 'add',
          path: '/generalPractitioner',
          value: [{ reference: 'Practitioner/123' }],
        },
      ]);
    expect(res.status).toBe(200);
  });

  describe.each<['writer' | 'reader']>([['writer'], ['reader']])('On %s', (repoMode) => {
    test('Search', async () => {
      const readerSpy = jest.spyOn(getDatabasePool(DatabaseMode.READER), 'query');
      const writerSpy = jest.spyOn(getDatabasePool(DatabaseMode.WRITER), 'query');
      const token = repoMode === 'writer' ? accessToken : searchOnReaderAccessToken;

      const res = await request(app)
        .get(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + token);
      expect(res.status).toBe(200);

      if (repoMode === 'writer') {
        expect(writerSpy).toHaveBeenCalledTimes(1);
        expect(readerSpy).toHaveBeenCalledTimes(0);
      } else {
        expect(writerSpy).toHaveBeenCalledTimes(0);
        expect(readerSpy).toHaveBeenCalledTimes(1);
      }
    });

    test('Search by POST', async () => {
      const readerSpy = jest.spyOn(getDatabasePool(DatabaseMode.READER), 'query');
      const writerSpy = jest.spyOn(getDatabasePool(DatabaseMode.WRITER), 'query');
      const token = repoMode === 'writer' ? accessToken : searchOnReaderAccessToken;

      const res = await request(app)
        .post(`/fhir/R4/Patient/_search`)
        .set('Authorization', 'Bearer ' + token)
        .type('form');
      expect(res.status).toBe(200);
      const result = res.body as Bundle;
      expect(result.type).toStrictEqual('searchset');
      expect(result.entry?.length).toBeGreaterThan(0);

      if (repoMode === 'writer') {
        expect(writerSpy).toHaveBeenCalledTimes(1);
        expect(readerSpy).toHaveBeenCalledTimes(0);
      } else {
        expect(writerSpy).toHaveBeenCalledTimes(0);
        expect(readerSpy).toHaveBeenCalledTimes(1);
      }
    });

    test('Search multiple resource types with _type', async () =>
      withTestContext(async () => {
        const { accessToken } = await createTestProject({
          withAccessToken: true,
          project:
            repoMode === 'reader' ? { systemSetting: [{ name: 'searchOnReader', valueBoolean: true }] } : undefined,
        });

        const res1 = await request(app)
          .post('/fhir/R4/Patient')
          .set('Authorization', 'Bearer ' + accessToken)
          .send({ resourceType: 'Patient' });
        expect(res1.status).toBe(201);

        const res2 = await request(app)
          .post('/fhir/R4/Observation')
          .set('Authorization', 'Bearer ' + accessToken)
          .send({
            resourceType: 'Observation',
            status: 'final',
            code: { text: 'test' },
            subject: { reference: `Patient/${res1.body.id}` },
          });
        expect(res2.status).toBe(201);

        const readerSpy = jest.spyOn(getDatabasePool(DatabaseMode.READER), 'query');
        const writerSpy = jest.spyOn(getDatabasePool(DatabaseMode.WRITER), 'query');

        const res3 = await request(app)
          .get('/fhir/R4?_type=Patient,Observation')
          .set('Authorization', 'Bearer ' + accessToken);
        expect(res3.status).toBe(200);

        const patient = res1.body;
        const obs = res2.body;
        const bundle = res3.body;

        expect(bundle.entry?.length).toBe(2);
        expect(bundleContains(bundle, patient)).toBeTruthy();
        expect(bundleContains(bundle, obs)).toBeTruthy();

        if (repoMode === 'writer') {
          expect(writerSpy).toHaveBeenCalledTimes(1);
          expect(readerSpy).toHaveBeenCalledTimes(0);
        } else {
          expect(writerSpy).toHaveBeenCalledTimes(0);
          expect(readerSpy).toHaveBeenCalledTimes(1);
        }

        // Also verify that trailing slash works
        const res4 = await request(app)
          .get('/fhir/R4/?_type=Patient,Observation')
          .set('Authorization', 'Bearer ' + accessToken);
        expect(res4.status).toBe(200);
        const bundle2 = res4.body;
        expect(bundle2.entry?.length).toBe(2);
        expect(bundleContains(bundle2, patient)).toBeTruthy();
        expect(bundleContains(bundle2, obs)).toBeTruthy();
      }));
  });

  test('Search invalid resource', async () => {
    const res = await request(app)
      .get(`/fhir/R4/Patientx`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('Search invalid search parameter', async () => {
    const res = await request(app)
      .get(`/fhir/R4/ServiceRequest?basedOn=ServiceRequest/123`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toStrictEqual('Unknown search parameter: basedOn');
  });

  test('Validate create success', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/$validate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient' });
    expect(res.status).toBe(200);
  });

  test('Validate create failure', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/$validate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Patient', badProperty: 'bad' });
    expect(res.status).toBe(400);
  });

  test('Validate wrong content type', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/$validate`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.TEXT)
      .send('hello');
    expect(res.status).toBe(400);
  });

  test('Reindex resource access denied', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patientId}/$reindex`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res.status).toBe(403);
  });

  test('Resend subscriptions access denied', async () => {
    const res = await request(app)
      .post(`/fhir/R4/Patient/${patientId}/$resend`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res.status).toBe(403);
  });

  test('Resend as project admin', async () => {
    const { profile, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res = await request(app)
      .post(`/fhir/R4/${getReferenceString(profile)}/$resend`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({});
    expect(res.status).toBe(200);

    // Resend with verbose=true
    const res2 = await request(app)
      .post(`/fhir/R4/${getReferenceString(profile)}/$resend`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ verbose: true });
    expect(res2.status).toBe(200);

    // Resend with subscription option
    const res3 = await request(app)
      .post(`/fhir/R4/${getReferenceString(profile)}/$resend`)
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ subscription: 'Subscription/123' });
    expect(res3.status).toBe(200);
  });

  test('ProjectMembership with null access policy', async () =>
    withTestContext(async () => {
      const adminRegistration = await createTestProject({
        membership: { admin: true },
        withRepo: true,
        withAccessToken: true,
      });
      expect(adminRegistration).toBeDefined();

      const normalRegistration = await addTestUser(adminRegistration.project);
      expect(normalRegistration).toBeDefined();

      const membership = normalRegistration.membership;

      const res1 = await request(app)
        .get(`/fhir/R4/ProjectMembership/${membership.id}`)
        .set('Authorization', 'Bearer ' + adminRegistration.accessToken);
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .get(`/fhir/R4/ProjectMembership/${membership.id}`)
        .set('Authorization', 'Bearer ' + normalRegistration.accessToken);
      expect(res2.status).toBe(403);

      const res3 = await request(app)
        .put(`/fhir/R4/ProjectMembership/${membership.id}`)
        .set('Authorization', 'Bearer ' + normalRegistration.accessToken)
        .send({ ...membership, accessPolicy: undefined });
      expect(res3.status).toBe(403);
    }));

  test('Set accounts on create', async () => {
    const { project, accessToken } = await createTestProject({ withAccessToken: true });

    const res1 = await request(app)
      .post('/fhir/R4/Organization')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({ resourceType: 'Organization' });
    expect(res1.status).toBe(201);

    const account = res1.body as Organization;

    const res2 = await request(app)
      .post('/fhir/R4/Questionnaire')
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Questionnaire',
        meta: { accounts: [{ reference: getReferenceString(account) }] },
        title: 'Questionnaire A.1',
        status: 'active',
        item: [
          {
            linkId: '1',
            text: 'How would you rate your overall experience?',
            type: 'choice',
            answerOption: [
              {
                valueCoding: {
                  system: 'http://example.org/rating',
                  code: '5',
                  display: 'Excellent',
                },
              },
            ],
          },
        ],
      });
    expect(res2.status).toBe(201);
    expect(res2.body.meta?.accounts?.length).toBe(1);
    expect(res2.body.meta?.accounts?.[0].reference).toBe(getReferenceString(account));

    // There should be 2 compartments:
    // 1: the project
    // 2: the account organization
    const compartments = res2.body.meta?.compartment as Reference[];
    expect(compartments.length).toBe(2);
    expect(compartments.find((c) => c.reference === getReferenceString(project))).toBeDefined();
    expect(compartments.find((c) => c.reference === getReferenceString(account))).toBeDefined();
  });
});
