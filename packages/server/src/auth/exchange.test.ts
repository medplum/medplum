// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType } from '@medplum/core';
import type { ClientApplication, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import fetch from 'node-fetch';
import request from 'supertest';
import { createClient } from '../admin/client';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getProjectSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { registerNew } from './register';

jest.mock('node-fetch');

const app = express();
const domain = randomUUID() + '.example.com';
const email = `text@${domain}`;
const redirectUri = `https://${domain}/auth/callback`;
const externalId = `google-oauth2|${randomUUID()}`;
let project: WithId<Project>;
let defaultClient: ClientApplication;
let externalAuthClient: ClientApplication;
let subjectAuthClient: ClientApplication;
let gcipAuthClient: ClientApplication;
let gcipSubjectAuthClient: ClientApplication;

describe('Token Exchange', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(async () => {
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

      const systemRepo = await getProjectSystemRepo(project);

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

      gcipAuthClient = await createClient(systemRepo, {
        project,
        name: 'GCIP Auth Client',
        redirectUri,
        identityProvider: {
          ...identityProvider,
          userInfoUrl: 'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
          userInfoMode: 'gcip',
          userInfoApiKey: 'test-api-key',
        },
      });

      gcipSubjectAuthClient = await createClient(systemRepo, {
        project,
        name: 'GCIP Subject Auth Client',
        redirectUri,
        identityProvider: {
          ...identityProvider,
          userInfoUrl: 'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
          userInfoMode: 'gcip',
          userInfoApiKey: 'test-api-key',
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
    });
  });

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

  test('GCIP success', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ users: [{ email, localId: 'firebase-user-id' }] }),
    }));

    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'firebase-token',
      clientId: gcipAuthClient.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-api-key',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: ContentType.JSON,
          'Content-Type': ContentType.JSON,
        }),
        body: JSON.stringify({ idToken: 'firebase-token' }),
      })
    );
    expect(new URL((fetch as unknown as jest.Mock).mock.calls.at(-1)?.[0]).searchParams.get('key')).toBe(
      'test-api-key'
    );
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
    }));

    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'xyz',
      clientId: externalAuthClient.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_request');
    expect(res.body.error_description).toBe('Failed to verify code - unsupported content type: text/plain');
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

  test('GCIP subject auth success', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ users: [{ email: '', localId: externalId }] }),
    }));

    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'firebase-token',
      clientId: gcipSubjectAuthClient.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
  });

  test('GCIP missing localId', async () => {
    (fetch as unknown as jest.Mock).mockImplementation(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ users: [{ email }] }),
    }));

    const res = await request(app).post('/auth/exchange').type('json').send({
      externalAccessToken: 'firebase-token',
      clientId: gcipAuthClient.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error_description).toBe('Failed to verify code - missing localId in user info response');
  });
});
