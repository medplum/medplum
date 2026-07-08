// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DomainConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';

describe('Method', () => {
  const app = express();
  const systemRepo = getGlobalSystemRepo();

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing email parameter', async () => {
    const res = await request(app).post('/auth/method').type('json').send({});
    expect(res).toHaveStatus(400);
  });

  test('Empty email parameter', async () => {
    const res = await request(app).post('/auth/method').type('json').send({ email: '' });
    expect(res).toHaveStatus(400);
  });

  test('Invalid email parameter', async () => {
    const res = await request(app).post('/auth/method').type('json').send({ email: 'xyz' });
    expect(res).toHaveStatus(400);
  });

  test('Domain config', async () => {
    const domain = randomUUID() + '.example.com';
    await withTestContext(() =>
      systemRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider: {
          authorizeUrl: 'https://example.com/oauth2/authorize',
          tokenUrl: 'https://example.com/oauth2/token',
          userInfoUrl: 'https://example.com/oauth2/userinfo',
          clientId: '123',
          clientSecret: '456',
        },
      })
    );

    // Domain config found
    const res1 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email: 'alice@' + domain });
    expect(res1).toHaveStatus(200);

    // Domain config not found
    const res2 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email: 'alice@' + randomUUID() + '.com' });
    expect(res2).toHaveStatus(200);
  });

  test('Domain config case sensitivity', async () => {
    const domain = randomUUID() + '.example.com';
    await withTestContext(() =>
      systemRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider: {
          authorizeUrl: 'https://example.com/oauth2/authorize',
          tokenUrl: 'https://example.com/oauth2/token',
          userInfoUrl: 'https://example.com/oauth2/userinfo',
          clientId: '123',
          clientSecret: '456',
        },
      })
    );

    // Domain config found
    const res1 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email: 'alice@' + domain.toUpperCase() });
    expect(res1).toHaveStatus(200);
  });

  test('Domain config authorize url without protocol', async () => {
    const domain = randomUUID() + '.example.com';
    await withTestContext(() =>
      systemRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider: {
          authorizeUrl: 'example.com/oauth2/authorize',
          tokenUrl: 'https://example.com/oauth2/token',
          userInfoUrl: 'https://example.com/oauth2/userinfo',
          clientId: '123',
          clientSecret: '456',
        },
      })
    );

    // Domain config found
    const res1 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email: 'alice@' + domain });
    expect(res1).toHaveStatus(400);

    // Domain config not found
    const res2 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email: 'alice@' + randomUUID() + '.com' });
    expect(res2).toHaveStatus(200);
  });

  test('Missing email and domain parameters', async () => {
    const res = await request(app).post('/auth/method').type('json').send({});
    expect(res.status).toBe(400);
  });

  test('Domain parameter', async () => {
    const domain = randomUUID() + '.example.com';
    await withTestContext(() =>
      systemRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider: {
          authorizeUrl: 'https://example.com/oauth2/authorize',
          tokenUrl: 'https://example.com/oauth2/token',
          userInfoUrl: 'https://example.com/oauth2/userinfo',
          clientId: '123',
          clientSecret: '456',
        },
      })
    );

    // Domain config found via domain parameter (no email required)
    const res1 = await request(app).post('/auth/method').type('json').send({ domain });
    expect(res1.status).toBe(200);
    expect(res1.body.domain).toBe(domain);
    expect(res1.body.authorizeUrl).toBeDefined();

    // Domain config not found
    const res2 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ domain: randomUUID() + '.com' });
    expect(res2.status).toBe(200);
    expect(res2.body).toStrictEqual({});
  });

  test('Domain parameter case sensitivity', async () => {
    const domain = randomUUID() + '.example.com';
    await withTestContext(() =>
      systemRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider: {
          authorizeUrl: 'https://example.com/oauth2/authorize',
          tokenUrl: 'https://example.com/oauth2/token',
          userInfoUrl: 'https://example.com/oauth2/userinfo',
          clientId: '123',
          clientSecret: '456',
        },
      })
    );

    // Domain lookup is case-insensitive
    const res = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ domain: domain.toUpperCase() });
    expect(res.status).toBe(200);
    expect(res.body.authorizeUrl).toBeDefined();
  });
});
