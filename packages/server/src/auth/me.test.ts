import { createReference } from '@medplum/core';
import { UserConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { pwnedPassword } from 'hibp';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';
import { setupPwnedPasswordMock, setupRecaptchaMock } from '../test.setup';
import { registerNew } from './register';

jest.mock('hibp');
jest.mock('node-fetch');

const app = express();

describe('Me', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    (fetch as unknown as jest.Mock).mockClear();
    (pwnedPassword as unknown as jest.Mock).mockClear();
    setupPwnedPasswordMock(pwnedPassword as unknown as jest.Mock, 0);
    setupRecaptchaMock(fetch as unknown as jest.Mock, true);
  });

  test('Unauthenticated', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('User configuration', async () => {
    const { project, membership, accessToken } = await registerNew({
      firstName: 'Alexander',
      lastName: 'Hamilton',
      projectName: 'Hamilton Project',
      email: `alex${randomUUID()}@example.com`,
      password: 'password!@#',
    });

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
  });
});
