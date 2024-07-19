import { createReference } from '@medplum/core';
import { UserConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { createTestProject, withTestContext } from '../test.setup';
import { registerNew } from './register';

const app = express();

describe('Me', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Unauthenticated', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('User configuration', async () => {
    const { project, membership, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      })
    );

    // Get the user profile with default user configuration
    const res2 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toBeDefined();
    expect(res2.body.profile).toBeDefined();
    expect(res2.body.profile.resourceType).toBe('Practitioner');
    expect(res2.body.config).toBeDefined();
    expect(res2.body.config.resourceType).toBe('UserConfiguration');

    // Create a new user configuration
    const config: UserConfiguration = {
      resourceType: 'UserConfiguration',
      menu: [
        {
          title: 'My Menu',
          link: [{ name: 'My Link', target: '/my-target' }],
        },
      ],
    };
    const res3 = await request(app)
      .post('/fhir/R4/UserConfiguration')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send(config);
    expect(res3.status).toBe(201);
    expect(res3.body.resourceType).toBe('UserConfiguration');
    expect(res3.body.id).toBeDefined();
    expect(res3.body).toMatchObject(config);

    // Read the project membership
    const res4 = await request(app)
      .get(`/admin/projects/${project.id}/members/${membership.id}`)
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res4.status).toBe(200);
    expect(res4.body.resourceType).toBe('ProjectMembership');

    // Update the project membership
    const res5 = await request(app)
      .post(`/admin/projects/${project.id}/members/${membership.id}`)
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({
        ...res4.body,
        userConfiguration: createReference(res3.body),
      });
    expect(res5.status).toBe(200);

    // Reload the user profile with the new user configuration
    const res6 = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res6.status).toBe(200);
    expect(res6.body).toBeDefined();
    expect(res6.body.config).toMatchObject(config);
    expect(res6.body.security).toBeDefined();
    expect(res6.body.security.sessions).toBeDefined();
    expect(res6.body.security.sessions[0].browser).toBeDefined();
    expect(res6.body.security.sessions[0].os).toBeDefined();
  });

  test('Get me as ClientApplication', async () => {
    const { client } = await withTestContext(() =>
      registerNew({
        firstName: 'Client',
        lastName: 'Test',
        projectName: 'Client Test',
        email: `client${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res.status).toBe(200);
    expect(res.body.error).toBeUndefined();
  });

  test('AccessPolicy.basedOn', async () => {
    const { accessToken, accessPolicy } = await withTestContext(() =>
      createTestProject({
        withAccessToken: true,
        accessPolicy: {
          resource: [{ resourceType: 'Patient' }],
        },
      })
    );

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.accessPolicy).toBeDefined();
    expect(res.body.accessPolicy.basedOn).toBeDefined();
    expect(res.body.accessPolicy.basedOn).toMatchObject([createReference(accessPolicy)]);
  });
});
