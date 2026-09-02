// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference } from '@medplum/core';
import type { AuditEvent, ClientApplication, Login } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { createTestClient, createTestProject, getSuperAdminTestProject, withTestContext } from '../test.setup';
import { globalLogger } from '../logger';
import { generateAccessToken, generateIdToken, generateRefreshToken, generateSecret } from './keys';
import { PROMPT_BASIC_AUTH_PARAM } from './middleware';

describe('Auth middleware', () => {
  const app = express();
  const systemRepo = getGlobalSystemRepo();
  let client: WithId<ClientApplication>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    client = await createTestClient();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Login not found', async () => {
    const accessToken = await generateAccessToken({
      login_id: randomUUID(),
      sub: client.id,
      username: client.id,
      client_id: client.id,
      profile: client.resourceType + '/' + client.id,
      scope: 'openid',
    });

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(401);
  });

  test('Login revoked', async () => {
    const scope = 'openid';

    const login = await withTestContext(() =>
      systemRepo.createResource<Login>({
        resourceType: 'Login',
        authMethod: 'client',
        user: createReference(client),
        client: createReference(client),
        authTime: new Date().toISOString(),
        revoked: true,
        scope,
      })
    );

    const accessToken = await generateAccessToken({
      login_id: login.id,
      sub: client.id,
      username: client.id,
      client_id: client.id,
      profile: client.resourceType + '/' + client.id,
      scope,
    });

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res).toHaveStatus(401);
  });

  test('No auth header', async () => {
    const res = await request(app).get('/fhir/R4/Patient');
    expect(res.header['www-authenticate']).toBe(`Bearer realm="${getConfig().baseUrl}"`);
    expect(res).toHaveStatus(401);
  });

  test('No auth header with magic param', async () => {
    const res = await request(app).get(`/fhir/R4/Patient?${PROMPT_BASIC_AUTH_PARAM}=1`);
    expect(res.header['www-authenticate']).toBe(`Basic realm="${getConfig().baseUrl}"`);
    expect(res).toHaveStatus(401);
  });

  test('Unrecognized auth header', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'foo');
    expect(res).toHaveStatus(401);
  });

  test('Unrecognized auth token type', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'foo foo');
    expect(res).toHaveStatus(401);
  });

  test('Invalid bearer token', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'Bearer foo');
    expect(res).toHaveStatus(401);
    expect(res.header['www-authenticate']).toBe(`Bearer realm="${getConfig().baseUrl}"`);
  });

  test('Basic auth empty string', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'Basic ');
    expect(res).toHaveStatus(401);
    expect(res.header['www-authenticate']).toBe(`Basic realm="${getConfig().baseUrl}"`);
  });

  test('Basic auth malformed string', async () => {
    const res = await request(app).get('/fhir/R4/Patient').set('Authorization', 'Basic foo');
    expect(res).toHaveStatus(401);
  });

  test('Basic auth empty username', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(':' + client.secret).toString('base64'));
    expect(res).toHaveStatus(401);
  });

  test('Basic auth empty password', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':').toString('base64'));
    expect(res).toHaveStatus(401);
  });

  test('Basic auth client not found', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(randomUUID() + ':' + client.secret).toString('base64'));
    expect(res).toHaveStatus(401);
  });

  test('Basic auth wrong password', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':wrong').toString('base64'));
    expect(res).toHaveStatus(401);
  });

  test('Basic auth success', async () => {
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res).toHaveStatus(200);
  });

  test('Basic auth project', async () => {
    const res = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({
        resourceType: 'Patient',
        name: [
          {
            given: ['Given'],
            family: 'Family',
          },
        ],
      });
    expect(res).toHaveStatus(201);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.project).toBeUndefined();
  });

  test('Basic auth project with extended mode', async () => {
    const res = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'))
      .set('Content-Type', ContentType.FHIR_JSON)
      .set('X-Medplum', 'extended')
      .send({
        resourceType: 'Patient',
        name: [
          {
            given: ['Given'],
            family: 'Family',
          },
        ],
      });
    expect(res).toHaveStatus(201);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.project).toBeDefined();
  });

  test('Basic auth without project membership', async () => {
    const client = await withTestContext(() =>
      systemRepo.createResource<ClientApplication>({
        resourceType: 'ClientApplication',
        name: 'Client without project membership',
        secret: generateSecret(32),
      })
    );

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res).toHaveStatus(401);
  });

  test('Basic auth with inactive project membership', async () => {
    const client = await createTestClient({ membership: { active: false } });
    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res).toHaveStatus(401);
  });

  test('ID token rejected as access token', async () => {
    const { client, login, accessToken } = await createTestProject({ withClient: true, withAccessToken: true });

    // Control: the access token for this login works
    const res1 = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res1).toHaveStatus(200);

    // The ID token for the same login must not be accepted as an API credential
    const idToken = await generateIdToken({
      login_id: login.id,
      client_id: client.id,
      aud: client.id,
      sub: client.id,
      nonce: randomUUID(),
    });

    const res2 = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + idToken);
    expect(res2).toHaveStatus(401);
  });

  test('Refresh token rejected as access token', async () => {
    const { client, login } = await createTestProject({ withClient: true, withAccessToken: true });

    const refreshToken = await generateRefreshToken({
      login_id: login.id,
      client_id: client.id,
      refresh_secret: generateSecret(32),
    });

    const res = await request(app)
      .get('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + refreshToken);
    expect(res).toHaveStatus(401);
  });

  test('Basic auth with inactive client status', async () => {
    for (const status of ['off', 'error'] as const) {
      const client = await createTestClient();
      const authHeader = 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64');

      // Control: the client works before it is disabled
      const res1 = await request(app).get('/fhir/R4/Patient').set('Authorization', authHeader);
      expect(res1).toHaveStatus(200);

      await withTestContext(() => systemRepo.updateResource<ClientApplication>({ ...client, status }));

      const res2 = await request(app).get('/fhir/R4/Patient').set('Authorization', authHeader);
      expect(res2).toHaveStatus(401);
    }
  });

  test('Basic auth with IP access rules', async () => {
    const client = await createTestClient({
      accessPolicy: {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: '*' }],
        ipAccessRule: [
          { name: 'Block test', value: '6.6.6.6', action: 'block' },
          { name: 'Allow by default', value: '*', action: 'allow' },
        ],
      },
    });
    const authHeader = 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64');

    const res1 = await request(app)
      .get('/fhir/R4/Patient')
      .set('X-Forwarded-For', '6.6.6.6')
      .set('Authorization', authHeader);
    expect(res1).toHaveStatus(401);

    const res2 = await request(app)
      .get('/fhir/R4/Patient')
      .set('X-Forwarded-For', '5.5.5.5')
      .set('Authorization', authHeader);
    expect(res2).toHaveStatus(200);
  });

  test('Bearer auth AuditEvent uses current request IP, not stale login.remoteAddress', async () => {
    const { client, membership } = await createTestProject({ withClient: true });
    const scope = 'openid';

    const login = await withTestContext(() =>
      systemRepo.createResource<Login>({
        resourceType: 'Login',
        authMethod: 'client',
        user: createReference(client),
        client: createReference(client),
        membership: createReference(membership),
        authTime: new Date().toISOString(),
        remoteAddress: '198.51.100.1',
        scope,
      })
    );

    const accessToken = await generateAccessToken({
      login_id: login.id,
      sub: client.id,
      username: client.id,
      client_id: client.id,
      profile: client.resourceType + '/' + client.id,
      scope,
    });

    const config = getConfig();
    config.logAuditEvents = true;
    const writeSpy = vi.spyOn(globalLogger, 'write' as any).mockImplementation(() => undefined);

    try {
      const res = await request(app)
        .get('/fhir/R4/Patient')
        .set('X-Forwarded-For', '203.0.113.7')
        .set('Authorization', 'Bearer ' + accessToken);
      expect(res).toHaveStatus(200);

      const loggedReadCall = writeSpy.mock.calls.find((call: unknown[]) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.resourceType === 'AuditEvent' && parsed.type?.code === 'rest';
        } catch {
          return false;
        }
      });
      expect(loggedReadCall).toBeDefined();
      const auditEvent = JSON.parse((loggedReadCall as unknown[])[0] as string) as AuditEvent;
      expect(auditEvent.agent?.[0]?.network?.address).toBe('203.0.113.7');
    } finally {
      config.logAuditEvents = false;
      writeSpy.mockRestore();
    }
  });

  test('Basic auth with super admin client', async () => {
    const { client, project } = await getSuperAdminTestProject();
    const { project: otherProject } = await createTestProject({ withClient: false });
    const res = await request(app)
      .get(`/fhir/R4/Project?_total=accurate&_id=${project.id},${otherProject.id}`)
      .set('Authorization', 'Basic ' + Buffer.from(client.id + ':' + client.secret).toString('base64'));
    expect(res).toHaveStatus(200);
    expect(res.body.total).toBe(2);
  });
});
