import { DomainConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { systemRepo } from '../fhir/repo';

const app = express();

describe('Method', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing email parameter', async () => {
    const res = await request(app).post('/auth/method').type('json').send({});
    expect(res.status).toBe(400);
  });

  test('Empty email parameter', async () => {
    const res = await request(app).post('/auth/method').type('json').send({ email: '' });
    expect(res.status).toBe(400);
  });

  test('Invalid email parameter', async () => {
    const res = await request(app).post('/auth/method').type('json').send({ email: 'xyz' });
    expect(res.status).toBe(400);
  });

  test('Domain config', async () => {
    const domain = randomUUID() + '.example.com';
    await systemRepo.createResource<DomainConfiguration>({
      resourceType: 'DomainConfiguration',
      domain,
      identityProvider: {
        authorizeUrl: 'https://example.com/oauth2/authorize',
        tokenUrl: 'https://example.com/oauth2/token',
        userInfoUrl: 'https://example.com/oauth2/userinfo',
        clientId: '123',
        clientSecret: '456',
      },
    });

    // Domain config found
    const res1 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email: 'alice@' + domain });
    expect(res1.status).toBe(200);

    // Domain config not found
    const res2 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email: 'alice@' + randomUUID() + '.com' });
    expect(res2.status).toBe(200);
  });
});
