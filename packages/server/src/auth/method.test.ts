// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DomainConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

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
    expect(res1.status).toBe(200);

    // Domain config not found
    const res2 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email: 'alice@' + randomUUID() + '.com' });
    expect(res2.status).toBe(200);
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
    expect(res1.status).toBe(200);
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
    expect(res1.status).toBe(400);

    // Domain config not found
    const res2 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email: 'alice@' + randomUUID() + '.com' });
    expect(res2.status).toBe(200);
  });

  test('Project-level domain config found when projectId provided', async () => {
    const domain = randomUUID() + '.example.com';
    const email = 'alice@' + domain;

    const project = await withTestContext(async () => {
      const result = await registerNew({
        firstName: 'Test',
        lastName: 'User',
        projectName: 'Project Domain Config Test',
        email,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Test',
      });
      const projectRepo = getProjectSystemRepo(result.project);
      await projectRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider: {
          authorizeUrl: 'https://project-idp.example.com/oauth2/authorize',
          tokenUrl: 'https://project-idp.example.com/oauth2/token',
          userInfoUrl: 'https://project-idp.example.com/oauth2/userinfo',
          clientId: 'project-client-id',
          clientSecret: 'project-client-secret',
        },
      });
      return result.project;
    });

    // With matching projectId - project-level config found
    const res1 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email, projectId: project.id });
    expect(res1.status).toBe(200);
    expect(res1.body.authorizeUrl).toContain('project-idp.example.com');

    // Without projectId - falls through to global search (may still find if global search includes project-scoped)
    // With a different projectId - should not find the project-specific config
    const res2 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email, projectId: randomUUID() });
    expect(res2.status).toBe(200);
    // res2 should not have the project-specific authorizeUrl
    expect(res2.body.authorizeUrl).not.toContain('project-idp.example.com');
  });

  test('Project-level domain config takes precedence over global config', async () => {
    const domain = randomUUID() + '.example.com';
    const email = 'bob@' + domain;

    // Create a global domain config for the same domain
    await withTestContext(() =>
      systemRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider: {
          authorizeUrl: 'https://global-idp.example.com/oauth2/authorize',
          tokenUrl: 'https://global-idp.example.com/oauth2/token',
          userInfoUrl: 'https://global-idp.example.com/oauth2/userinfo',
          clientId: 'global-client-id',
          clientSecret: 'global-client-secret',
        },
      })
    );

    const project = await withTestContext(async () => {
      const result = await registerNew({
        firstName: 'Test',
        lastName: 'User',
        projectName: 'Project Domain Priority Test',
        email,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Test',
      });
      const projectRepo = getProjectSystemRepo(result.project);
      await projectRepo.createResource<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        domain,
        identityProvider: {
          authorizeUrl: 'https://project-idp.example.com/oauth2/authorize',
          tokenUrl: 'https://project-idp.example.com/oauth2/token',
          userInfoUrl: 'https://project-idp.example.com/oauth2/userinfo',
          clientId: 'project-client-id',
          clientSecret: 'project-client-secret',
        },
      });
      return result.project;
    });

    // With projectId - should get project-level config (not global)
    const res1 = await request(app)
      .post('/auth/method')
      .type('json')
      .send({ email, projectId: project.id });
    expect(res1.status).toBe(200);
    expect(res1.body.authorizeUrl).toContain('project-idp.example.com');

    // Without projectId - should get global config
    const res2 = await request(app).post('/auth/method').type('json').send({ email });
    expect(res2.status).toBe(200);
    expect(res2.body.authorizeUrl).toContain('global-idp.example.com');
  });
});
