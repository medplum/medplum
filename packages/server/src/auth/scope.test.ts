import { Login } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

describe('Scope', () => {
  const app = express();
  const systemRepo = getSystemRepo();
  const email = `multi${randomUUID()}@example.com`;
  const password = randomUUID();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);

    await withTestContext(() =>
      registerNew({
        firstName: 'Scope',
        lastName: 'Scope',
        projectName: 'Scope Project',
        email,
        password,
      })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing login', async () => {
    const res = await request(app).post('/auth/scope').type('json').send({
      scope: 'openid profile',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing login');
  });

  test('Missing scope', async () => {
    const res = await request(app).post('/auth/scope').type('json').send({
      login: '123',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Missing scope');
  });

  test('Login not found', async () => {
    const res = await request(app).post('/auth/scope').type('json').send({
      login: randomUUID(),
      scope: 'openid profile',
    });
    expect(res.status).toBe(404);
    expect(res.body.issue).toBeDefined();
    expect(res.body.issue[0].details.text).toBe('Not found');
  });

  test('Login revoked', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();

    const login = await systemRepo.readResource<Login>('Login', res1.body.login);
    await withTestContext(() =>
      systemRepo.updateResource({
        ...login,
        revoked: true,
      })
    );

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Login revoked');
  });

  test('Login granted', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();

    const login = await systemRepo.readResource<Login>('Login', res1.body.login);
    await withTestContext(() =>
      systemRepo.updateResource({
        ...login,
        granted: true,
      })
    );

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Login granted');
  });

  test('Success', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeDefined();

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile',
    });
    expect(res2.status).toBe(200);
    expect(res2.body.code).toBeDefined();
  });

  test('Invalid scope', async () => {
    const res1 = await request(app).post('/auth/login').type('json').send({
      scope: 'openid profile',
      email,
      password,
    });
    expect(res1.status).toBe(200);
    expect(res1.body.login).toBeDefined();
    expect(res1.body.code).toBeDefined();

    const res2 = await request(app).post('/auth/scope').type('json').send({
      login: res1.body.login,
      scope: 'openid profile extra-invalid-scope',
    });
    expect(res2.status).toBe(400);
    expect(res2.body.issue).toBeDefined();
    expect(res2.body.issue[0].details.text).toBe('Invalid scope');
  });
});
