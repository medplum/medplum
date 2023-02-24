import { createReference } from '@medplum/core';
import { AccessPolicy } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { systemRepo } from '../fhir/repo';

const app = express();
let accessToken: string;

describe('SCIM Routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    // First, Alice creates a project
    const registration = await registerNew({
      firstName: 'Alice',
      lastName: 'Smith',
      projectName: 'Alice Project',
      email: `alice${randomUUID()}@example.com`,
      password: 'password!@#',
    });
    accessToken = registration.accessToken;

    // Create default access policy
    const accessPolicy = await systemRepo.createResource<AccessPolicy>({
      resourceType: 'AccessPolicy',
      resource: [{ resourceType: 'Patient' }],
    });

    // Update project with default access policy
    await systemRepo.updateResource({
      ...registration.project,
      defaultPatientAccessPolicy: createReference(accessPolicy),
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Search users', async () => {
    const res = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(200);

    const result = res.body;
    expect(result.totalResults).toBeDefined();
    expect(result.Resources).toBeDefined();
  });

  test('Create and update user', async () => {
    const res1 = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userType: 'Patient',
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(res1.status).toBe(201);

    const readResponse = await request(app)
      .get(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(readResponse.status).toBe(200);
    expect(readResponse.body.id).toBe(res1.body.id);

    const searchResponse = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchResponse.status).toBe(200);

    const searchCheck = searchResponse.body.Resources.find((user: any) => user.id === res1.body.id);
    expect(searchCheck).toBeDefined();

    const updateResponse = await request(app)
      .put(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        ...res1.body,
        externalId: randomUUID(),
      });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.externalId).toBeDefined();

    const deleteResponse = await request(app)
      .delete(`/scim/v2/Users/${res1.body.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(deleteResponse.status).toBe(204);

    const searchResponse2 = await request(app)
      .get(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(searchResponse2.status).toBe(200);

    const searchCheck2 = searchResponse2.body.Resources.find((user: any) => user.id === res1.body.id);
    expect(searchCheck2).toBeUndefined();
  });

  test('Create missing medplum user type', async () => {
    const res = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', 'application/json')
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        name: {
          givenName: 'SCIM',
          familyName: 'User',
        },
        emails: [{ value: randomUUID() + '@example.com' }],
      });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Missing Medplum user type');
  });
});
