// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import { ContentType, encodeBase64Url, getReferenceString } from '@medplum/core';
import type { Practitioner, Project, ProjectMembership } from '@medplum/fhirtypes';
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
  const externalSub = randomUUID();
  let testProject: WithId<Project>;
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
    testProject = project;

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

    // Invite a Practitioner with externalId for sub claim tests
    await inviteUser({
      project,
      resourceType: 'Practitioner',
      firstName: 'External',
      lastName: 'User',
      externalId: externalSub,
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

  test('Missing fhirUser and sub', async () => {
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

  test('Success by ext.fhirUser', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      ext: { fhirUser: getReferenceString(practitioner) },
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });

  test('Success by sub claim', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
      scope: 'openid profile',
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });

  test('Sub claim with caching', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);

    // Call again - should use cache (no second fetch mock needed)
    const res2 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res2.status).toBe(200);
  });

  test('Sub claim with unknown externalId', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: 'nonexistent-' + randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Sub claim with remote userinfo failure', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 401,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: false }),
    }));

    // Use a unique nonce to avoid cache hits from prior tests
    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('fhirUser takes precedence over sub', async () => {
    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    // JWT has both fhirUser and sub; fhirUser should be used
    // Use a unique nonce to avoid cache hits from prior tests
    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(practitioner),
      sub: externalSub,
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(200);
  });

  test('Sub claim with inactive membership', async () => {
    const inactiveSub = randomUUID();
    const { membership: inactiveMembership } = await inviteUser({
      project: testProject,
      resourceType: 'Practitioner',
      firstName: 'Inactive',
      lastName: 'User',
      externalId: inactiveSub,
    });
    await getSystemRepo().updateResource<ProjectMembership>({
      ...inactiveMembership,
      active: false,
    });

    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: inactiveSub,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });

  test('Sub claim with duplicate externalId returns 401', async () => {
    const duplicateSub = randomUUID();

    // Create two memberships with the same externalId in different projects
    const { project: project2 } = await createTestProject();
    await inviteUser({
      project: testProject,
      resourceType: 'Practitioner',
      firstName: 'Dup',
      lastName: 'One',
      externalId: duplicateSub,
    });
    await inviteUser({
      project: project2,
      resourceType: 'Practitioner',
      firstName: 'Dup',
      lastName: 'Two',
      externalId: duplicateSub,
    });

    (fetch as unknown as jest.Mock).mockImplementationOnce(() => ({
      status: 200,
      headers: { get: () => ContentType.JSON },
      json: () => ({ ok: true }),
    }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: duplicateSub,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res.status).toBe(401);
  });
});

function createFakeJwt(claims: Record<string, unknown>): string {
  return `header.${encodeBase64Url(JSON.stringify(claims))}.signature`;
}
