import { ContentType, createReference } from '@medplum/core';
import { AccessPolicy } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config';
import { AuthenticatedRequestContext, requestContextStore } from '../context';
import { getSystemRepo } from '../fhir/repo';

// Based on: https://developer.okta.com/docs/guides/scim-provisioning-integration-prepare/main/

describe('Okta SCIM Tests', () => {
  const app = express();
  let accessToken: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    await requestContextStore.run(AuthenticatedRequestContext.system(), async () => {
      const registration = await registerNew({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#',
      });
      accessToken = registration.accessToken;

      const systemRepo = getSystemRepo();

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
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Okta script', async () => {
    // #1 Required Test: Test Users endpoint

    const res1 = await request(app)
      .get('/scim/v2/Users')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res1.status).toBe(200);
    expect(res1.body.Resources).not.toBeNull();
    expect(res1.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
    expect(res1.body.itemsPerPage).toBeDefined();
    expect(res1.body.startIndex).toBeDefined();
    expect(res1.body.totalResults).toBeDefined();
    expect(res1.body.Resources[0].id).toBeDefined();
    expect(res1.body.Resources[0].name.familyName).toBeDefined();
    expect(res1.body.Resources[0].name.givenName).toBeDefined();
    expect(res1.body.Resources[0].userName).toBeDefined();
    expect(res1.body.Resources[0].active).toBe(true);
    expect(res1.body.Resources[0].emails[0].value).toBeDefined();

    const isvUserId = res1.body.Resources[0].id;

    // #2	Required Test: Get Users/{{id}}

    const res2 = await request(app)
      .get(`/scim/v2/Users/${isvUserId}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res2.status).toBe(200);
    expect(res2.body.id).toBeDefined();
    expect(res2.body.name.familyName).toBeDefined();
    expect(res2.body.name.givenName).toBeDefined();
    expect(res2.body.userName).toBeDefined();
    expect(res2.body.active).toBe(true);
    expect(res2.body.emails[0].value).toBeDefined();
    expect(res2.body.id).toBe(isvUserId);

    // #3	Required Test: Test invalid User by username

    const res3 = await request(app)
      .get('/scim/v2/Users?filter=' + encodeURIComponent('userName eq "abcdefgh@atko.com"'))
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res3.status).toBe(200);
    expect(res3.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
    expect(res3.body.totalResults).toBe(0);

    // #4 Required Test: Test invalid User by ID

    const res4 = await request(app)
      .get('/scim/v2/Users/invaliduserid')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(404);
    expect(res4.body.detail).toBe('Not found');
    expect(res4.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');

    // #5	Required Test: Test invalid User by username

    const res5 = await request(app)
      .get('/scim/v2/Users?filter=' + encodeURIComponent('userName eq "Runscope258Fuhpfuwaw309@atko.com"'))
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res5.status).toBe(200);
    expect(res5.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
    expect(res5.body.totalResults).toBe(0);

    // #6	Required Test: Create Okta user with realisitic value

    const res6 = await request(app)
      .post(`/scim/v2/Users`)
      .set('Authorization', 'Bearer ' + accessToken)
      .set('Content-Type', ContentType.JSON)
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'Runscope258Fuhpfuwaw309@atko.com',
        name: { givenName: 'Runscope258', familyName: 'Fuhpfuwaw309' },
        emails: [{ primary: true, value: 'Runscope258Fuhpfuwaw309@atko.com', type: 'work' }],
        displayName: 'Runscope258 Fuhpfuwaw309',
        active: true,
      });
    expect(res6.status).toBe(201);
    expect(res6.body.active).toBe(true);
    expect(res6.body.id).toBeDefined();
    expect(res6.body.name.familyName).toBe('Fuhpfuwaw309');
    expect(res6.body.name.givenName).toBe('Runscope258');
    expect(res6.body.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
    expect(res6.body.userName).toBe('Runscope258Fuhpfuwaw309@atko.com');

    const idUserOne = res6.body.id;
    const randomUserEmail = res6.body.emails[0].value;

    // #7	Required Test: Verify that user was created

    const res7 = await request(app)
      .get(`/scim/v2/Users/${idUserOne}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res7.status).toBe(200);
    expect(res7.body.userName).toBe('Runscope258Fuhpfuwaw309@atko.com');
    expect(res7.body.name.familyName).toBe('Fuhpfuwaw309');
    expect(res7.body.name.givenName).toBe('Runscope258');
    expect(res7.body.emails[0].value).toBe(randomUserEmail);
  });
});
