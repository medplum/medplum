import { ClientApplication } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { generateSecret, initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();

describe('Register', () => {

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

  test('Success', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();
    expect(res.body.idToken).not.toBeUndefined();
    expect(res.body.accessToken).not.toBeUndefined();
    expect(res.body.refreshToken).not.toBeUndefined();
  });

  test('Email already registered', async () => {
    const registerRequest = {
      firstName: 'George',
      lastName: 'Washington',
      projectName: 'Washington Project',
      email: `george${randomUUID()}@example.com`,
      password: 'password!@#'
    };

    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send(registerRequest);

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();

    const res2 = await request(app)
      .post('/auth/register')
      .type('json')
      .send(registerRequest);

    expect(res2.status).toBe(400);
    expect(res2.body.issue[0].details.text).toBe('Email already registered');
    expect(res2.body.issue[0].expression[0]).toBe('email');
  });

  test('Cannot access Project resource', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).not.toBeUndefined();

    const res2 = await request(app)
      .get(`/fhir/R4/Project/${res.body.project.id}`)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res2.status).toBe(404);
  });

  test('Can access Practitioner resource', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();

    const res2 = await request(app)
      .get(`/fhir/R4/Practitioner/${res.body.profile.id}`)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res2.status).toBe(200);
  });

  test('Can create a ClientApplication', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alexander',
        lastName: 'Hamilton',
        projectName: 'Hamilton Project',
        email: `alex${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.profile).not.toBeUndefined();

    const client: ClientApplication = {
      resourceType: 'ClientApplication',
      name: 'Test App',
      secret: generateSecret(48),
      redirectUri: 'https://example.com'
    };

    const res2 = await request(app)
      .post(`/fhir/R4/ClientApplication`)
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send(client);

    expect(res2.status).toBe(201);
  });

});
