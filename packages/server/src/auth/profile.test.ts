import { getReferenceString, ProfileResource } from '@medplum/core';
import { Login, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { systemRepo } from '../fhir/repo';
import { registerNew } from './register';

const app = express();
const email = `multi${randomUUID()}@example.com`;
const password = randomUUID();
let profile1: ProfileResource;
let profile2: ProfileResource;

describe('Profile', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

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
      resourceType: 'Practitioner',
      firstName: 'Multi2',
      lastName: 'Multi2',
      email,
    });

    profile1 = registerResult.profile;
    profile2 = inviteResult.profile;
  });

  afterAll(async () => {
    await shutdownApp();
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

    const login = await systemRepo.readResource<Login>('Login', res1.body.login);
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

    const login = await systemRepo.readResource<Login>('Login', res1.body.login);
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

    const login = await systemRepo.readResource<Login>('Login', res1.body.login);
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

  test('Membership for different user', async () => {
    // Create a dummy ProjectMembership
    const membership = await systemRepo.createResource<ProjectMembership>({
      resourceType: 'ProjectMembership',
      project: { reference: randomUUID() },
      profile: { reference: randomUUID() },
      user: { reference: randomUUID() },
    });

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

    const res2 = await request(app)
      .post('/auth/profile')
      .type('json')
      .send({
        login: res1.body.login,
        profile: membership.id as string,
      });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Invalid profile');
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
