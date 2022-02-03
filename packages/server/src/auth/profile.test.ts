import { assertOk, getReferenceString, ProfileResource } from '@medplum/core';
import { Login } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp } from '../app';
import { loadTestConfig } from '../config';
import { closeDatabase, initDatabase } from '../database';
import { systemRepo } from '../fhir';
import { initKeys } from '../oauth';
import { seedDatabase } from '../seed';
import { registerNew } from './register';

jest.mock('@aws-sdk/client-sesv2');

const app = express();
const email = `multi${randomUUID()}@example.com`;
const password = randomUUID();
let profile1: ProfileResource;
let profile2: ProfileResource;

describe('Profile', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initDatabase(config.database);
    await seedDatabase();
    await initApp(app);
    await initKeys(config);

    // Create a user with multiple profiles
    // Use the same user/email in the same project
    const registerResult = await registerNew({
      firstName: 'Multi1',
      lastName: 'Multi1',
      projectName: 'Multi Project',
      email,
      password,
    });

    const inviteResult = await inviteUser({
      project: registerResult.project,
      firstName: 'Multi2',
      lastName: 'Multi2',
      email,
    });

    profile1 = registerResult.profile;
    profile2 = inviteResult;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('Missing login', async () => {
    const res = await request(app).post('/auth/profile').type('json').send({
      profile: 'Practitioner/123',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing login');
  });

  test('Missing profile', async () => {
    const res = await request(app).post('/auth/profile').type('json').send({
      login: '123',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing profile');
  });

  test('Login not found', async () => {
    const res = await request(app)
      .post('/auth/profile')
      .type('json')
      .send({
        login: randomUUID(),
        profile: getReferenceString(profile1),
      });
    expect(res.status).toBe(404);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Not found');
  });

  test('Login revoked', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();

    const [readOutcome, login] = await systemRepo.readResource<Login>('Login', res1.body.login);
    assertOk(readOutcome, login);
    await systemRepo.updateResource({
      ...login,
      revoked: true,
    });

    const res2 = await request(app)
      .post('/auth/profile')
      .type('json')
      .send({
        login: res1.body.login,
        profile: getReferenceString(profile1),
      });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Login revoked');
  });

  test('Login granted', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();

    const [readOutcome, login] = await systemRepo.readResource<Login>('Login', res1.body.login);
    assertOk(readOutcome, login);
    await systemRepo.updateResource({
      ...login,
      granted: true,
    });

    const res2 = await request(app)
      .post('/auth/profile')
      .type('json')
      .send({
        login: res1.body.login,
        profile: getReferenceString(profile1),
      });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Login granted');
  });

  test('Login profile already set', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();

    const [readOutcome, login] = await systemRepo.readResource<Login>('Login', res1.body.login);
    assertOk(readOutcome, login);
    await systemRepo.updateResource({
      ...login,
      membership: {
        reference: `ProjectMembership/${randomUUID()}`,
      },
    });

    const res2 = await request(app)
      .post('/auth/profile')
      .type('json')
      .send({
        login: res1.body.login,
        profile: getReferenceString(profile1),
      });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Login profile already set');
  });

  test('Membership not found', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeUndefined();
    expect(res1.body.memberships).toBeDefined();
    expect(res1.body.memberships.length).toBe(2);
    expect(res1.body.memberships.find((p: any) => p.profile.reference === getReferenceString(profile1))).toBeDefined();
    expect(res1.body.memberships.find((p: any) => p.profile.reference === getReferenceString(profile2))).toBeDefined();

    const res2 = await request(app).post('/auth/profile').type('json').send({
      login: res1.body.login,
      profile: randomUUID(),
    });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Profile not found');
  });

  test('Success', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeUndefined();
    expect(res1.body.memberships).toBeDefined();
    expect(res1.body.memberships.length).toBe(2);
    expect(res1.body.memberships.find((p: any) => p.profile.reference === getReferenceString(profile1))).toBeDefined();
    expect(res1.body.memberships.find((p: any) => p.profile.reference === getReferenceString(profile2))).toBeDefined();

    const res2 = await request(app).post('/auth/profile').type('json').send({
      login: res1.body.login,
      profile: res1.body.memberships[0].id,
    });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });
});
