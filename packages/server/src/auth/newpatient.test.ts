import { createReference, Operator, resolveId } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { setupPwnedPasswordMock, setupRecaptchaMock, withTestContext } from '../test.setup';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('New patient', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(async () => {
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Patient registration', async () => {
    const systemRepo = getSystemRepo();

    // Register as Christina
    const res1 = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        firstName: 'Christina',
        lastName: 'Smith',
        email: `christina${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      });
    expect(res1.status).toBe(200);

    const res2 = await request(app).post('/auth/newproject').type('json').send({
      login: res1.body.login,
      projectName: 'Christina Project',
    });
    expect(res2.status).toBe(200);

    const res3 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res2.body.code,
      code_verifier: 'xyz',
    });
    expect(res3.status).toBe(200);

    const projectId = resolveId(res3.body.project) as string;

    // Try to register as a patient in the new project
    // (This should fail)
    const res4 = await request(app)
      .post('/auth/newuser')
      .type('json')
      .send({
        projectId,
        firstName: 'Peggy',
        lastName: 'Patient',
        email: `peggy${randomUUID()}@example.com`,
        password: 'password!@#',
        recaptchaToken: 'xyz',
        codeChallenge: 'xyz',
        codeChallengeMethod: 'plain',
      });
    expect(res4.status).toBe(200);

    const res5 = await request(app).post('/auth/newpatient').type('json').send({
      login: res4.body.login,
      projectId: projectId,
    });
    expect(res5.status).toBe(400);

    // As Christina, create a default access policy for new patients
    const res6 = await request(app)
      .post(`/fhir/R4/AccessPolicy`)
      .set('Authorization', 'Bearer ' + res3.body.access_token)
      .type('json')
      .send({
        resourceType: 'AccessPolicy',
        name: 'Default Patient Policy',
        compartment: {
          reference: '%patient',
        },
        resource: [
          {
            resourceType: 'Patient',
            criteria: 'Patient?_id=%patient.id',
          },
          {
            resourceType: 'Observation',
            criteria: 'Observation?subject=%patient',
          },
        ],
      });
    expect(res6.status).toBe(201);

    // As a super admin, enable patient registration
    await withTestContext(() =>
      systemRepo.patchResource('Project', projectId, [
        {
          op: 'add',
          path: '/defaultPatientAccessPolicy',
          value: createReference(res6.body),
        },
      ])
    );

    // Try to register as a patient in the new project
    // (This should succeed)
    const res7 = await request(app).post('/auth/newpatient').type('json').send({
      login: res4.body.login,
      projectId,
    });
    expect(res7.status).toBe(200);
    expect(res7.body.code).toBeDefined();

    // Try to reuse the login
    // (This should fail)
    const res8 = await request(app).post('/auth/newpatient').type('json').send({
      login: res4.body.login,
      projectId,
    });
    expect(res8.status).toBe(400);

    // Try to register as a patient without a login
    // (This should fail)
    const res9 = await request(app).post('/auth/newpatient').type('json').send({
      projectId,
    });
    expect(res9.status).toBe(400);

    // Get the Patient
    const res10 = await request(app)
      .get(`/fhir/R4/Patient`)
      .set('Authorization', 'Bearer ' + res3.body.access_token);
    expect(res10.status).toBe(200);

    const patient = res10.body.entry[0].resource as Patient;

    // Get the ProjectMembership
    const membershipBundle = await systemRepo.search({
      resourceType: 'ProjectMembership',
      filters: [{ code: 'profile', operator: Operator.EQUALS, value: 'Patient/' + patient.id }],
    });
    expect(membershipBundle).toBeDefined();
    expect(membershipBundle.entry).toBeDefined();
    expect(membershipBundle.entry).toHaveLength(1);

    // Create an observation for the new patient
    const res11 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + res3.body.access_token)
      .type('json')
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: createReference(patient),
      });
    expect(res11.status).toBe(201);

    // Create an observation for a different patient
    const res12 = await request(app)
      .post(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + res3.body.access_token)
      .type('json')
      .send({
        resourceType: 'Observation',
        status: 'final',
        code: { text: 'test' },
        subject: { reference: randomUUID() },
      });
    expect(res12.status).toBe(201);

    // Login as the patient
    const res13 = await request(app).post('/oauth2/token').type('form').send({
      grant_type: 'authorization_code',
      code: res7.body.code,
      code_verifier: 'xyz',
    });
    expect(res13.status).toBe(200);

    // Make sure that the patient can only access their observations
    const res14 = await request(app)
      .get(`/fhir/R4/Observation`)
      .set('Authorization', 'Bearer ' + res13.body.access_token);
    expect(res14.status).toBe(200);
    expect(res14.body.entry).toHaveLength(1);
    expect(res14.body.entry[0].resource.id).toEqual(res11.body.id);
  });
});
