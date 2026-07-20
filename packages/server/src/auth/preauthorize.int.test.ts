// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, getReferenceString, notFound } from '@medplum/core';
import type { ClientApplication, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import type { ServerInviteResponse } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { addTestUser, createTestProject, withTestContext } from '../test.setup';
import { MAX_PRE_AUTH_CODE_TTL } from './preauthorize';

describe('Pre-authorize', () => {
  const app = express();
  let project: WithId<Project>;
  let client: WithId<ClientApplication>;
  let accessToken: string;
  let testAccount: ServerInviteResponse & { accessToken: string };

  beforeAll(async () => {
    const config = await loadTestConfig();

    await withTestContext(async () => {
      await initApp(app, config);

      ({ project, client, accessToken } = await createTestProject({
        membership: { admin: true },
        withClient: true,
        withAccessToken: true,
      }));

      testAccount = await addTestUser(project);
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Requires auth', async () => {
    const res = await request(app).post('/auth/preauthorize').type('json').send({ clientId: client.id });
    expect(res).toHaveStatus(401);
  });

  test('Requires project admin', async () => {
    const res = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${testAccount.accessToken}`)
      .type('json')
      .send({ clientId: client.id });
    expect(res).toHaveStatus(403);
  });

  test('Requires clientId', async () => {
    const res = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({});
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject(badRequest('Client ID is required'));
  });

  test('Requires onBehalfOfMembership', async () => {
    const res = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ clientId: client.id });
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject(badRequest('Pre-authorization requires onBehalfOfMembership'));
  });

  test('Client not found', async () => {
    const res = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount.profile))
      .type('json')
      .send({ clientId: randomUUID() });
    expect(res).toHaveStatus(404);
    expect(res.body).toMatchObject(notFound);
  });

  test('Expire time too short', async () => {
    const res = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ clientId: client.id, expiresIn: 0 });
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject(
      badRequest(`expiresIn must be a positive integer not exceeding ${MAX_PRE_AUTH_CODE_TTL} seconds`)
    );
  });

  test('Expire time too long', async () => {
    const res = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .type('json')
      .send({ clientId: client.id, expiresIn: MAX_PRE_AUTH_CODE_TTL + 1 });
    expect(res).toHaveStatus(400);
    expect(res.body).toMatchObject(
      badRequest(`expiresIn must be a positive integer not exceeding ${MAX_PRE_AUTH_CODE_TTL} seconds`)
    );
  });

  test('Success', async () => {
    const res = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount.profile))
      .type('json')
      .send({ clientId: client.id });
    expect(res).toHaveStatus(200);
    expect(res.body.preAuthorizedCode).toBeDefined();
    expect(res.body.expiresAt).toBeDefined();
    expect(res.body.code).toBeUndefined();
  });

  test('Succeeds when on-behalf-of user cannot read ClientApplication', async () => {
    // AccessPolicy that allows Patient only — no ClientApplication.
    // Minting must not depend on the target user's ability to read ClientApplication.
    const restrictedAccount = await withTestContext(() =>
      addTestUser(project, {
        accessPolicy: {
          resourceType: 'AccessPolicy',
          resource: [{ resourceType: 'Patient' }],
        },
      })
    );

    const res = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(restrictedAccount.profile))
      .type('json')
      .send({ clientId: client.id });
    expect(res).toHaveStatus(200);
    expect(res.body.preAuthorizedCode).toBeDefined();
    expect(res.body.expiresAt).toBeDefined();
  });

  test('Rejects ClientApplication from another project', async () => {
    const other = await withTestContext(() => createTestProject({ withClient: true }));

    const res = await request(app)
      .post('/auth/preauthorize')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount.profile))
      .type('json')
      .send({ clientId: other.client.id });
    expect(res).toHaveStatus(404);
    expect(res.body).toMatchObject(notFound);
  });
});
