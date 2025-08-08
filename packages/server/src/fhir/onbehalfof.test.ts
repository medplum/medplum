// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, forbidden, getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { addTestUser, createTestProject, withTestContext } from '../test.setup';

describe('On Behalf Of', () => {
  const app = express();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Set meta onBehalfOf with basic auth', () =>
    withTestContext(async () => {
      // Create a single project and single admin client
      const adminAccount = await createTestProject({
        withClient: true,
        withAccessToken: true,
        membership: { admin: true },
      });

      const { client, project } = adminAccount;

      // Setup basic auth for the admin client
      // This client will be the "primary" user for all HTTP requests
      const basicAuth = 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64');

      // Create two test accounts
      // These represent 2 "normal" users
      // They will be the "onBehalfOf" users for all HTTP requests

      const org1 = 'Organization/' + randomUUID();
      const testAccount1 = await addTestUser(project, {
        resourceType: 'AccessPolicy',
        compartment: { reference: org1 },
        resource: [{ resourceType: 'Patient', criteria: 'Patient?_compartment=' + org1 }],
      });

      const org2 = 'Organization/' + randomUUID();
      const testAccount2 = await addTestUser(project, {
        resourceType: 'AccessPolicy',
        compartment: { reference: org2 },
        resource: [{ resourceType: 'Patient', criteria: 'Patient?_compartment=' + org2 }],
      });

      // Create a patient on behalf of test account 1
      const res1 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount1.profile))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ resourceType: 'Patient' });
      expect(res1.status).toBe(201);
      expect(res1.body.resourceType).toStrictEqual('Patient');
      expect(res1.headers.location).toContain('Patient');
      expect(res1.headers.location).toContain(res1.body.id);

      const patient1 = res1.body;
      expect(patient1.resourceType).toBe('Patient');
      expect(patient1.meta.author.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient1.meta.onBehalfOf.reference).toStrictEqual(getReferenceString(testAccount1.profile));

      // Read the patient on behalf of test account 1
      const res2 = await request(app)
        .get(`/fhir/R4/Patient/` + patient1.id)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount1.profile));
      expect(res2.status).toBe(200);

      const patient2 = res2.body;
      expect(patient2.resourceType).toBe('Patient');
      expect(patient2.id).toBe(patient1.id);
      expect(patient2.meta.author.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient2.meta.onBehalfOf.reference).toStrictEqual(getReferenceString(testAccount1.profile));

      // Create a patient on behalf of test account 2
      const res3 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount2.profile))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ resourceType: 'Patient' });
      expect(res3.status).toBe(201);
      expect(res3.body.resourceType).toStrictEqual('Patient');
      expect(res3.headers.location).toContain('Patient');
      expect(res3.headers.location).toContain(res3.body.id);

      const patient3 = res3.body;
      expect(patient3.resourceType).toBe('Patient');
      expect(patient3.meta.author.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient3.meta.onBehalfOf.reference).toStrictEqual(getReferenceString(testAccount2.profile));

      // Read the patient on behalf of test account 2
      const res4 = await request(app)
        .get(`/fhir/R4/Patient/` + patient3.id)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount2.profile));
      expect(res4.status).toBe(200);

      const patient4 = res4.body;
      expect(patient4.resourceType).toBe('Patient');
      expect(patient4.id).toBe(patient3.id);
      expect(patient4.meta.author.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient4.meta.onBehalfOf.reference).toStrictEqual(getReferenceString(testAccount2.profile));

      // Try to read the first patient on behalf of test account 2
      // This should fail because the patient was created on behalf of test account 1
      const res5 = await request(app)
        .get(`/fhir/R4/Patient/` + patient1.id)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount2.profile));
      expect(res5.status).toBe(404);

      // Try to read the second patient on behalf of test account 1
      // This should fail because the patient was created on behalf of test account 2
      const res6 = await request(app)
        .get(`/fhir/R4/Patient/` + patient3.id)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount1.profile));
      expect(res6.status).toBe(404);
    }));

  test('Set meta onBehalfOf with client credentials', () =>
    withTestContext(async () => {
      // Create a single project and single admin client
      const adminAccount = await createTestProject({
        withClient: true,
        withAccessToken: true,
        membership: { admin: true },
      });

      const { accessToken, project } = adminAccount;

      // Create two test accounts
      // These represent 2 "normal" users
      // They will be the "onBehalfOf" users for all HTTP requests

      const org1 = 'Organization/' + randomUUID();
      const testAccount1 = await addTestUser(project, {
        resourceType: 'AccessPolicy',
        compartment: { reference: org1 },
        resource: [{ resourceType: 'Patient', criteria: 'Patient?_compartment=' + org1 }],
      });

      const org2 = 'Organization/' + randomUUID();
      const testAccount2 = await addTestUser(project, {
        resourceType: 'AccessPolicy',
        compartment: { reference: org2 },
        resource: [{ resourceType: 'Patient', criteria: 'Patient?_compartment=' + org2 }],
      });

      // Create a patient on behalf of test account 1
      const res1 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount1.profile))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ resourceType: 'Patient' });
      expect(res1.status).toBe(201);
      expect(res1.body.resourceType).toStrictEqual('Patient');
      expect(res1.headers.location).toContain('Patient');
      expect(res1.headers.location).toContain(res1.body.id);

      const patient1 = res1.body;
      expect(patient1.resourceType).toBe('Patient');
      expect(patient1.meta.author.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient1.meta.onBehalfOf.reference).toStrictEqual(getReferenceString(testAccount1.profile));

      // Read the patient on behalf of test account 1
      const res2 = await request(app)
        .get(`/fhir/R4/Patient/` + patient1.id)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount1.profile));
      expect(res2.status).toBe(200);

      const patient2 = res2.body;
      expect(patient2.resourceType).toBe('Patient');
      expect(patient2.id).toBe(patient1.id);
      expect(patient2.meta.author.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient2.meta.onBehalfOf.reference).toStrictEqual(getReferenceString(testAccount1.profile));

      // Create a patient on behalf of test account 2
      const res3 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount2.profile))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ resourceType: 'Patient' });
      expect(res3.status).toBe(201);
      expect(res3.body.resourceType).toStrictEqual('Patient');
      expect(res3.headers.location).toContain('Patient');
      expect(res3.headers.location).toContain(res3.body.id);

      const patient3 = res3.body;
      expect(patient3.resourceType).toBe('Patient');
      expect(patient3.meta.author.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient3.meta.onBehalfOf.reference).toStrictEqual(getReferenceString(testAccount2.profile));

      // Read the patient on behalf of test account 2
      const res4 = await request(app)
        .get(`/fhir/R4/Patient/` + patient3.id)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount2.profile));
      expect(res4.status).toBe(200);

      const patient4 = res4.body;
      expect(patient4.resourceType).toBe('Patient');
      expect(patient4.id).toBe(patient3.id);
      expect(patient4.meta.author.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient4.meta.onBehalfOf.reference).toStrictEqual(getReferenceString(testAccount2.profile));

      // Try to read the first patient on behalf of test account 2
      // This should fail because the patient was created on behalf of test account 1
      const res5 = await request(app)
        .get(`/fhir/R4/Patient/` + patient1.id)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount2.profile));
      expect(res5.status).toBe(404);

      // Try to read the second patient on behalf of test account 1
      // This should fail because the patient was created on behalf of test account 2
      const res6 = await request(app)
        .get(`/fhir/R4/Patient/` + patient3.id)
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount1.profile));
      expect(res6.status).toBe(404);
    }));

  test('Forbidden for non-admin', () =>
    withTestContext(async () => {
      // Create a project with a non-admin user
      const testAccount1 = await createTestProject({
        withClient: true,
        withAccessToken: true,
      });

      const { client, project } = testAccount1;
      const basicAuth = 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64');
      const testAccount2 = await addTestUser(project);

      // Try to use onBehalfOf without admin rights
      // This should fail
      const res1 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount2.profile))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ resourceType: 'Patient' });
      expect(res1.status).toBe(403);
      expect(res1.body).toMatchObject(forbidden);
    }));

  test('Forbidden for cross project', () =>
    withTestContext(async () => {
      const adminAccount1 = await createTestProject({
        withClient: true,
        withAccessToken: true,
        membership: { admin: true },
      });

      const adminAccount2 = await createTestProject({
        withClient: true,
        withAccessToken: true,
        membership: { admin: true },
      });

      const { client } = adminAccount1;
      const basicAuth = 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64');

      // Try to use onBehalfOf for a different project
      // This should fail
      const res1 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(adminAccount2.client))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ resourceType: 'Patient' });
      expect(res1.status).toBe(403);
      expect(res1.body).toMatchObject(forbidden);
    }));

  test('Consistent meta.account behavior', () =>
    withTestContext(async () => {
      // Create a single project and single admin client
      const adminAccount = await createTestProject({
        withClient: true,
        withAccessToken: true,
        membership: { admin: true },
      });

      const { client, project } = adminAccount;

      // Setup basic auth for the admin client
      // This client will be the "primary" user for all HTTP requests
      const basicAuth = 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64');

      // Create non-admin test account
      // They will be the "onBehalfOf" users for all HTTP requests
      const account = 'Organization/' + randomUUID();
      const testAccount = await addTestUser(project, {
        resourceType: 'AccessPolicy',
        compartment: { reference: account },
        resource: [{ resourceType: 'Patient', criteria: 'Patient?_compartment=' + account }],
      });

      // Create a patient on behalf of test account 1
      const res1 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount.profile))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({ resourceType: 'Patient' });
      expect(res1.status).toBe(201);
      expect(res1.body.resourceType).toStrictEqual('Patient');

      const patient1 = res1.body as Patient;
      expect(patient1.resourceType).toBe('Patient');
      expect(patient1.meta?.author?.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient1.meta?.onBehalfOf?.reference).toStrictEqual(getReferenceString(testAccount.profile));
      expect(patient1.meta?.account?.reference).toStrictEqual(account);
      expect(patient1.meta?.accounts?.length).toStrictEqual(1);
      expect(patient1.meta?.accounts?.[0]?.reference).toStrictEqual(account);

      // Pass in empty meta.
      // This should be ignored, because the on-behalf-of user is not a project admin
      const res2 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount.profile))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Patient',
          meta: {},
        });
      expect(res2.status).toBe(201);
      expect(res2.body.resourceType).toStrictEqual('Patient');

      const patient2 = res2.body as Patient;
      expect(patient2.resourceType).toBe('Patient');
      expect(patient2.id).not.toBe(patient1.id);
      expect(patient2.meta?.author?.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient2.meta?.onBehalfOf?.reference).toStrictEqual(getReferenceString(testAccount.profile));
      expect(patient2.meta?.account?.reference).toStrictEqual(account);
      expect(patient2.meta?.accounts?.length).toStrictEqual(1);
      expect(patient2.meta?.accounts?.[0]?.reference).toStrictEqual(account);

      // Try to manually set the meta.account
      // This should be ignored, because the on-behalf-of user is not a project admin
      const res3 = await request(app)
        .post(`/fhir/R4/Patient`)
        .set('Authorization', basicAuth)
        .set('X-Medplum', 'extended')
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount.profile))
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Patient',
          meta: {
            account: { reference: 'Organization/' + randomUUID() },
          },
        });
      expect(res3.status).toBe(201);
      expect(res3.body.resourceType).toStrictEqual('Patient');

      const patient3 = res3.body as Patient;
      expect(patient3.resourceType).toBe('Patient');
      expect(patient3.id).not.toBe(patient1.id);
      expect(patient3.meta?.author?.reference).toStrictEqual(getReferenceString(adminAccount.client));
      expect(patient3.meta?.onBehalfOf?.reference).toStrictEqual(getReferenceString(testAccount.profile));
      expect(patient3.meta?.account?.reference).toStrictEqual(account);
      expect(patient3.meta?.accounts?.length).toStrictEqual(1);
      expect(patient3.meta?.accounts?.[0]?.reference).toStrictEqual(account);
    }));
});
