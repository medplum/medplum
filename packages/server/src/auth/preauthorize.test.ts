// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { badRequest, getReferenceString, notFound, OAuthGrantType } from '@medplum/core';
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

  describe('Scope', () => {
    let wildcardToken: string;
    let patientToken: string;
    let fhircastToken: string;
    let systemToken: string;
    let patientAccount: ServerInviteResponse;

    beforeAll(async () => {
      patientAccount = await withTestContext(() => addTestUser(project, { resourceType: 'Patient' }));
      const tokens: string[] = [];
      for (const scope of [
        'openid user/*.rs',
        'openid user/Patient.rs',
        'openid user/Patient.rs fhircast/Patient-open.write offline_access',
        'openid system/*.rs',
      ]) {
        const res = await request(app).post('/oauth2/token').type('form').send({
          grant_type: OAuthGrantType.ClientCredentials,
          client_id: client.id,
          client_secret: client.secret,
          scope,
        });
        expect(res).toHaveStatus(200);
        tokens.push(res.body.access_token);
      }
      [wildcardToken, patientToken, fhircastToken, systemToken] = tokens;
    });

    // Tokens are minted in beforeAll, so cases reference them lazily
    test.each([
      ['narrower than caller scope', () => wildcardToken, 'openid user/Patient.r', 'openid user/Patient.r'],
      ['omitted scope inherits restricted caller scope', () => patientToken, undefined, 'openid user/Patient.rs'],
      ['omitted scope inherits only resource scopes', () => fhircastToken, undefined, 'openid user/Patient.rs'],
      [
        'non-SMART scope held by caller',
        () => fhircastToken,
        'openid user/Patient.rs fhircast/Patient-open.write',
        'openid user/Patient.rs fhircast/Patient-open.write',
      ],
      ['user scope under system scope', () => systemToken, 'openid user/Patient.rs', 'openid user/Patient.rs'],
      ['unrestricted caller may request any scope', () => accessToken, 'openid user/*.cruds', 'openid user/*.cruds'],
    ])('Grants scope within caller scope: %s', async (_desc, getToken, scope, expected) => {
      const res = await request(app)
        .post('/auth/preauthorize')
        .set('Authorization', `Bearer ${getToken()}`)
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount.profile))
        .type('json')
        .send({ clientId: client.id, scope });
      expect(res).toHaveStatus(200);

      const redeemRes = await request(app).post('/oauth2/token').type('form').send({
        grant_type: OAuthGrantType.PreAuthorizedCode,
        client_id: client.id,
        'pre-authorized_code': res.body.preAuthorizedCode,
      });
      expect(redeemRes).toHaveStatus(200);
      expect(redeemRes.body.scope).toBe(expected);
    });

    test.each([
      ['additional resource type', 'openid user/Patient.rs user/Observation.rs'],
      ['additional permissions', 'openid user/Patient.cruds'],
      ['empty permissions', 'openid user/Patient.'],
      ['no SMART scopes (unrestricted)', 'openid'],
      ['non-SMART scope not held by caller', 'openid user/Patient.rs fhircast/Patient-open.write'],
    ])('Rejects scope broader than caller scope: %s', async (_desc, scope) => {
      const res = await request(app)
        .post('/auth/preauthorize')
        .set('Authorization', `Bearer ${patientToken}`)
        .set('X-Medplum-On-Behalf-Of', getReferenceString(testAccount.profile))
        .type('json')
        .send({ clientId: client.id, scope });
      expect(res).toHaveStatus(400);
      expect(res.body.issue[0].details.text).toBe('Invalid scope');
    });

    test('Grants patient scope under user scope only with patient context', async () => {
      const preauthorize = (profile: ServerInviteResponse['profile']): request.Test =>
        request(app)
          .post('/auth/preauthorize')
          .set('Authorization', `Bearer ${wildcardToken}`)
          .set('X-Medplum-On-Behalf-Of', getReferenceString(profile))
          .type('json')
          .send({ clientId: client.id, scope: 'openid patient/*.rs' });

      const res = await preauthorize(patientAccount.profile);
      expect(res).toHaveStatus(200);
      const redeemRes = await request(app).post('/oauth2/token').type('form').send({
        grant_type: OAuthGrantType.PreAuthorizedCode,
        client_id: client.id,
        'pre-authorized_code': res.body.preAuthorizedCode,
      });
      expect(redeemRes).toHaveStatus(200);
      expect(redeemRes.body.scope).toBe('openid patient/*.rs');

      const noContextRes = await preauthorize(testAccount.profile);
      expect(noContextRes).toHaveStatus(400);
      expect(noContextRes.body.issue[0].details.text).toBe('Invalid scope');
    });
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
