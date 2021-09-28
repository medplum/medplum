import { assertOk, createReference, getReferenceString, Login, Practitioner, User } from '@medplum/core';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { repo } from '../fhir';
import { initTestClientApplication } from '../jest.setup';
import { generateAccessToken, initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();

describe('Admin routes', () => {

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

  test('Get projects', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).not.toBeUndefined();

    const res2 = await request(app)
      .get('/admin/projects')
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res2.status).toBe(200);
    expect(res2.body.projects).not.toBeUndefined();
    expect(res2.body.projects.length).toEqual(1);
  });

  test('Get project', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'John',
        lastName: 'Adams',
        projectName: 'Adams Project',
        email: `john${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).not.toBeUndefined();
    expect(res.body.project.id).not.toBeUndefined();

    const res2 = await request(app)
      .get('/admin/projects/' + res.body.project.id)
      .set('Authorization', 'Bearer ' + res.body.accessToken);

    expect(res2.status).toBe(200);
    expect(res2.body.project).not.toBeUndefined();
    expect(res2.body.members).not.toBeUndefined();
    expect(res2.body.members.length).toEqual(1);
  });

  test('Get project access denied', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Alice',
        lastName: 'Smith',
        projectName: 'Alice Project',
        email: `alice${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).not.toBeUndefined();

    const res2 = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: `bob${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res2.status).toBe(200);
    expect(res2.body.project).not.toBeUndefined();

    // Try to access Alice's project using Bob's access token
    // Should fail
    const res3 = await request(app)
      .get('/admin/projects/' + res.body.project.id)
      .set('Authorization', 'Bearer ' + res2.body.accessToken);

    expect(res3.status).toBe(404);
  });

  test('Rebuild ValueSetElements as super admin', async () => {
    const client = await initTestClientApplication();

    const [practitionerOutcome, practitioner] = await repo.createResource<Practitioner>({
      resourceType: 'Practitioner'
    });
    assertOk(practitionerOutcome);

    const [userOutcome, user] = await repo.createResource<User>({
      resourceType: 'User',
      email: `super${randomUUID()}@example.com`,
      passwordHash: 'abc',
      admin: true
    });
    assertOk(userOutcome);

    const [loginOutcome, login] = await repo.createResource<Login>({
      resourceType: 'Login',
      client: createReference(client),
      profile: createReference(practitioner as Practitioner),
      authTime: new Date().toISOString(),
      scope: 'openid'
    });
    assertOk(loginOutcome);

    const accessToken = await generateAccessToken({
      login_id: login?.id as string,
      sub: user?.id as string,
      username: user?.id as string,
      client_id: client.id as string,
      profile: getReferenceString(practitioner as Practitioner),
      scope: 'openid'
    });

    const res = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({});

    expect(res.status).toEqual(200);
  });

  test('Rebuild ValueSetElements access denied', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: `bob${randomUUID()}@example.com`,
        password: 'password!@#'
      });

    expect(res.status).toBe(200);
    expect(res.body.project).not.toBeUndefined();

    const res2 = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({});

    expect(res2.status).toBe(400);
  });

});
