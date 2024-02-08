import { ContentType } from '@medplum/core';
import { ClientApplication, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import fetch from 'node-fetch';
import request from 'supertest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config';
import { getSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

jest.mock('node-fetch');

const app = express();
const domain = randomUUID() + '.example.com';
const email = `text@${domain}`;
const redirectUri = `https://${domain}/auth/callback`;
const externalId = `google-oauth2|${randomUUID()}`;
let project: Project;
let defaultClient: ClientApplication;
let externalAuthClient: ClientApplication;
let subjectAuthClient: ClientApplication;

describe('Token Exchange', () => {
  beforeAll(() =>
    withTestContext(async () => {
      const config = await loadTestConfig();
      await initApp(app, config);

      // Create a new project
      const registration = await registerNew({
        firstName: 'External',
        lastName: 'Text',
        projectName: 'External Test Project',
        email,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/107.0.0.0',
      });
      project = registration.project;
      defaultClient = registration.client;

      const identityProvider = {
        authorizeUrl: 'https://example.com/oauth2/authorize',
        tokenUrl: 'https://example.com/oauth2/token',
        userInfoUrl: 'https://example.com/oauth2/userinfo',
        clientId: '123',
        clientSecret: '456',
      };

      const systemRepo = getSystemRepo();

      // Create a new client application with external auth
      externalAuthClient = await createClient(systemRepo, {
        project,
        name: 'External Auth Client',
        redirectUri,
        identityProvider,
      });

      // Create a new client application with external subject auth
      subjectAuthClient = await createClient(systemRepo, {
        project,
        name: 'Subject Auth Client',
        redirectUri,
      });

      // Update client application with external auth
      await systemRepo.updateResource<ClientApplication>({
        ...subjectAuthClient,
        identityProvider: {
          ...identityProvider,
          useSubject: true,
        },
      });

      // Invite user with external ID
      await inviteUser({
        project,
        externalId,
        resourceType: 'Patient',
        firstName: 'External',
        lastName: 'User',
      });
    })
  );

  afterAll(async () => {
    await shutdownApp();
  });

  test('Missing externalAccessToken', async () => {
    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: '',
      clientId: defaultClient.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Missing externalAccessToken');
  });

  test('Missing clientId', async () => {
    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'xyz',
      clientId: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Missing clientId');
  });

  test('Missing identity provider', async () => {
    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'xyz',
      clientId: defaultClient.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error_description).toBe('Invalid client');
  });

  test('Unknown user', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ email: 'not-found@' + domain }),
    }));

    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'xyz',
      clientId: externalAuthClient.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('User not found');
  });

  test('ClientApplication success', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ email }),
    }));

    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'xyz',
      clientId: externalAuthClient.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
  });

  test('Missing projectId success', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ email }),
    }));

    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'xyz',
      projectId: '',
      clientId: externalAuthClient.id,
    });
    expect(res.status).toBe(200);
  });

  test('Invalid token request', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      headers: { get: () => ContentType.TEXT },
      json: () => {
        throw new Error('Invalid JSON');
      },
      text: () => 'Unexpected error',
    }));

    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'xyz',
      clientId: externalAuthClient.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Failed to verify code - check your identity provider configuration');
  });

  test('Subject auth success', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ email: '', sub: externalId }),
    }));

    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'xyz',
      clientId: subjectAuthClient.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
  });
});
