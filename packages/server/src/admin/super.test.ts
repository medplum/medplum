import { assertOk, createReference, getReferenceString } from '@medplum/core';
import { ClientApplication, Login, Practitioner, User } from '@medplum/fhirtypes';
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
let client: ClientApplication;
let adminAccessToken: string;
let nonAdminAccessToken: string;

describe('Super Admin routes', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);

    client = await createTestClient();

    const [outcome1, practitioner1] = await repo.createResource<Practitioner>({ resourceType: 'Practitioner' });
    assertOk(outcome1);

    const [outcome2, practitioner2] = await repo.createResource<Practitioner>({ resourceType: 'Practitioner' });
    assertOk(outcome2);

    const [outcome3, user1] = await repo.createResource<User>({
      resourceType: 'User',
      email: `super${randomUUID()}@example.com`,
      passwordHash: 'abc',
      admin: true,
    });
    assertOk(outcome3);

    const [outcome4, user2] = await repo.createResource<User>({
      resourceType: 'User',
      email: `normie${randomUUID()}@example.com`,
      passwordHash: 'abc',
      admin: false,
    });
    assertOk(outcome4);

    const [outcome5, login1] = await repo.createResource<Login>({
      resourceType: 'Login',
      client: createReference(client),
      profile: createReference(practitioner1 as Practitioner),
      authTime: new Date().toISOString(),
      scope: 'openid',
    });
    assertOk(outcome5);

    const [outcome6, login2] = await repo.createResource<Login>({
      resourceType: 'Login',
      client: createReference(client),
      profile: createReference(practitioner2 as Practitioner),
      authTime: new Date().toISOString(),
      scope: 'openid',
    });
    assertOk(outcome6);

    adminAccessToken = await generateAccessToken({
      login_id: login1?.id as string,
      sub: user1?.id as string,
      username: user1?.id as string,
      client_id: client.id as string,
      profile: getReferenceString(practitioner1 as Practitioner),
      scope: 'openid',
    });

    nonAdminAccessToken = await generateAccessToken({
      login_id: login2?.id as string,
      sub: user2?.id as string,
      username: user2?.id as string,
      client_id: client.id as string,
      profile: getReferenceString(practitioner2 as Practitioner),
      scope: 'openid',
    });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Rebuild ValueSetElements as super admin', async () => {
    const res = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toEqual(200);
  });

  test('Rebuild ValueSetElements access denied', async () => {
    const res = await request(app)
      .post('/admin/super/valuesets')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(403);
  });

  test('Rebuild StructureDefinitions as super admin', async () => {
    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toEqual(200);
  });

  test('Rebuild StructureDefinitions access denied', async () => {
    const res = await request(app)
      .post('/admin/super/structuredefinitions')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({});

    expect(res.status).toBe(403);
  });

  test('Reindex access denied', async () => {
    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + nonAdminAccessToken)
      .type('json')
      .send({
        resourceType: 'Patient',
      });

    expect(res.status).toBe(403);
  });

  test('Reindex success', async () => {
    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        resourceType: 'Patient',
      });

    expect(res.status).toBe(200);
  });

  test('Reindex invalid resource type', async () => {
    const res = await request(app)
      .post('/admin/super/reindex')
      .set('Authorization', 'Bearer ' + adminAccessToken)
      .type('json')
      .send({
        resourceType: 'XYZ',
      });

    expect(res.status).toBe(400);
  });
});
