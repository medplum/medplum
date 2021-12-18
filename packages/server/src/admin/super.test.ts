import { assertOk, createReference, getReferenceString } from '@medplum/core';
import { Login, Practitioner, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { repo } from '../fhir';
import { createTestClient } from '../jest.setup';
import { generateAccessToken, initKeys } from '../oauth';
import { seedDatabase } from '../seed';

const app = express();

describe('Super Admin routes', () => {
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

  test('Rebuild ValueSetElements as super admin', async () => {
    const client = await createTestClient();

    const [practitionerOutcome, practitioner] = await repo.createResource<Practitioner>({
      resourceType: 'Practitioner',
    });
    assertOk(practitionerOutcome);

    const [userOutcome, user] = await repo.createResource<User>({
      resourceType: 'User',
      email: `super${randomUUID()}@example.com`,
      passwordHash: 'abc',
      admin: true,
    });
    assertOk(userOutcome);

    const [loginOutcome, login] = await repo.createResource<Login>({
      resourceType: 'Login',
      client: createReference(client),
      profile: createReference(practitioner as Practitioner),
      authTime: new Date().toISOString(),
      scope: 'openid',
    });
    assertOk(loginOutcome);

    const accessToken = await generateAccessToken({
      login_id: login?.id as string,
      sub: user?.id as string,
      username: user?.id as string,
      client_id: client.id as string,
      profile: getReferenceString(practitioner as Practitioner),
      scope: 'openid',
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
        password: 'password!@#',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    const res2 = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({});

    expect(res2.status).toBe(400);
  });

  test('Rebuild StructureDefinitions as super admin', async () => {
    const client = await createTestClient();

    const [practitionerOutcome, practitioner] = await repo.createResource<Practitioner>({
      resourceType: 'Practitioner',
    });
    assertOk(practitionerOutcome);

    const [userOutcome, user] = await repo.createResource<User>({
      resourceType: 'User',
      email: `super${randomUUID()}@example.com`,
      passwordHash: 'abc',
      admin: true,
    });
    assertOk(userOutcome);

    const [loginOutcome, login] = await repo.createResource<Login>({
      resourceType: 'Login',
      client: createReference(client),
      profile: createReference(practitioner as Practitioner),
      authTime: new Date().toISOString(),
      scope: 'openid',
    });
    assertOk(loginOutcome);

    const accessToken = await generateAccessToken({
      login_id: login?.id as string,
      sub: user?.id as string,
      username: user?.id as string,
      client_id: client.id as string,
      profile: getReferenceString(practitioner as Practitioner),
      scope: 'openid',
    });

    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + accessToken)
      .type('json')
      .send({});

    expect(res.status).toEqual(200);
  });

  test('Rebuild StructureDefinitions access denied', async () => {
    const res = await request(app)
      .post('/auth/register')
      .type('json')
      .send({
        firstName: 'Bob',
        lastName: 'Jones',
        projectName: 'Bob Project',
        email: `bob${randomUUID()}@example.com`,
        password: 'password!@#',
      });

    expect(res.status).toBe(200);
    expect(res.body.project).toBeDefined();

    const res2 = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + res.body.accessToken)
      .type('json')
      .send({});

    expect(res2.status).toBe(400);
  });
});
