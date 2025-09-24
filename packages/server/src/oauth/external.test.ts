// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, encodeBase64Url, getReferenceString, ProfileResource, WithId } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import fetch from 'node-fetch';
import request from 'supertest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { getSystemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';

jest.mock('node-fetch');

// RFC 7662 - External auth

describe('External auth', () => {
  const app = express();
  const npi = randomUUID();
  let practitioner: WithId<ProfileResource>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    config.externalAuthProviders = [
      {
        issuer: 'https://external-auth.example.com',
        userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
      },
    ];

    // Initialize the app with the test config
    await initApp(app, config);

    // Create a test project
    const { project } = await createTestProject();

    // Invite a normal Practitioner user to the project
    const inviteResult = await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'Test',
      lastName: 'Person',
    });

    // Add NPI identifier to the practitioner
    practitioner = await getSystemRepo().updateResource<ProfileResource>({
      ...inviteResult.profile,
      identifier: [{ system: 'npi', value: npi }],
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Not a JWT', async () => {
    const res = await request(app).get(`/oauth2/userinfo`).set('Authorization', 'Bearer opaque_string');
    expect(res.status).toBe(401);
  });

  test('Missing issuer', async () => {
    const jwt = createFakeJwt({ foo: 'bar' });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Unknown issuer', async () => {
    const jwt = createFakeJwt({ iss: 'https://unknown-issuer.example.com' });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Missing fhirUser', async () => {
    const jwt = createFakeJwt({ iss: 'https://external-auth.example.com' });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Remote call to userinfo fails', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 401,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: false }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(practitioner),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Profile not found', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: 'Patient/123',
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Profile without membership', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    // Create a Practitioner profile that is not a member of the project
    const p2 = await getSystemRepo().createResource<Practitioner>({ resourceType: 'Practitioner' });
    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(p2),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Success by reference', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(practitioner),
      scope: 'openid profile',
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);

    // Call it again to ensure caching works
    const res2 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res2.status).toBe(200);
  });

  test('Success by search string', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: `Practitioner?identifier=${npi}`,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });

  test('Success by absolute URL', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: `https://external.idp/fhir/Practitioner?identifier=${npi}`,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });
});

function createFakeJwt(claims: Record<string, unknown>): string {
  return `header.${encodeBase64Url(JSON.stringify(claims))}.signature`;
}
