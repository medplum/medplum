import { createReference } from '@medplum/core';
import { Login, User } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';

describe('Status', () => {
  const app = express();
  const systemRepo = getSystemRepo();
  let user: User;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    user = await withTestContext(() =>
      systemRepo.createResource<User>({
        resourceType: 'User',
        firstName: 'Test',
        lastName: 'User',
        email: randomUUID() + '@example.com',
      })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing login parameter', async () => {
    const res = await request(app).get('/auth/login/');
    expect(res.status).toBe(404);
  });

  test('Invalid login parameter', async () => {
    const res = await request(app).get('/auth/login/x');
    expect(res.status).toBe(400);
  });

  test('Login not found', async () => {
    const res = await request(app).get('/auth/login/' + randomUUID());
    expect(res.status).toBe(404);
  });

  test('Success', async () => {
    const login = await withTestContext(() =>
      systemRepo.createResource<Login>({
        resourceType: 'Login',
        authMethod: 'password',
        authTime: new Date().toISOString(),
        user: createReference(user),
      })
    );

    const res = await request(app).get('/auth/login/' + login.id);
    expect(res.status).toBe(200);
    expect(res.body.login).toEqual(login.id);
  });

  test('Granted', async () => {
    const login = await withTestContext(() =>
      systemRepo.createResource<Login>({
        resourceType: 'Login',
        authMethod: 'password',
        authTime: new Date().toISOString(),
        user: createReference(user),
        granted: true,
      })
    );

    const res = await request(app).get('/auth/login/' + login.id);
    expect(res.status).toBe(400);
  });

  test('Revoked', async () => {
    const login = await withTestContext(() =>
      systemRepo.createResource<Login>({
        resourceType: 'Login',
        authMethod: 'password',
        authTime: new Date().toISOString(),
        user: createReference(user),
        revoked: true,
      })
    );

    const res = await request(app).get('/auth/login/' + login.id);
    expect(res.status).toBe(400);
  });
});
