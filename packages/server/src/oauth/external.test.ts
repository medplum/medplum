// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource, WithId } from '@medplum/core';
import { encodeBase64Url, getReferenceString } from '@medplum/core';
import type { Practitioner, Project, ProjectMembership } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { vi } from 'vitest';
import { inviteUser } from '../admin/invite';
import { initApp, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import type { MedplumExternalAuthConfig } from '../config/types';
import type { SystemRepository } from '../fhir/repo';
import { getProjectSystemRepo } from '../fhir/repo';
import { createTestProject } from '../test.setup';
import { mockFetchJson } from '../test.setup.fetch';

// RFC 7662 - External auth

const fetchMock = vi.spyOn(globalThis, 'fetch');
describe('External auth', () => {
  const app = express();
  const npi = randomUUID();
  const externalSub = randomUUID();
  let testProject: WithId<Project>;
  let practitioner: WithId<ProfileResource>;
  let systemRepo: SystemRepository;

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
    systemRepo = await getProjectSystemRepo(project);

    // Add NPI identifier to the practitioner
    practitioner = await systemRepo.updateResource<ProfileResource>({
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
    expect(res).toHaveStatus(401);
  });

  test('Missing issuer', async () => {
    const jwt = createFakeJwt({ foo: 'bar' });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
  });

  test('Unknown issuer', async () => {
    const jwt = createFakeJwt({ iss: 'https://unknown-issuer.example.com' });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
  });

  test('Missing fhirUser and sub', async () => {
    const jwt = createFakeJwt({ iss: 'https://external-auth.example.com' });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
  });

  test('Rejects provider without a verification URL', async () => {
    await withExternalAuthProviders(
      [
        {
          issuer: 'https://external-auth.example.com',
          identityProvider: { issuer: 'https://external-auth.example.com' },
        },
      ],
      async () => {
        const jwt = createFakeJwt({
          iss: 'https://external-auth.example.com',
          sub: externalSub,
          nonce: randomUUID(),
        });
        const res = await request(app)
          .get('/oauth2/userinfo')
          .set('Authorization', 'Bearer ' + jwt);
        expect(res).toHaveStatus(401);
      }
    );
  });

  test('Project-scoped request maps an identity-less token to the issuer client', async () => {
    const keyPair = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    const jwksUrl = 'https://external-auth.example.com/.well-known/project-jwks.json';
    const { client, project } = await createTestProject({
      withClient: true,
      client: {
        identityProvider: {
          issuer: 'https://external-auth.example.com',
          jwksUrl,
        },
      },
    });
    await withExternalAuthProviders(undefined, async () => {
      fetchMock.mockImplementationOnce(() => mockFetchJson({ keys: [publicJwk] }));

      const jwt = await new SignJWT({ nonce: randomUUID() })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuer('https://external-auth.example.com')
        .setSubject('external-client-subject')
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(keyPair.privateKey);
      const res = await request(app)
        .get(`/projects/${project.id}/oauth2/userinfo`)
        .set('Authorization', 'Bearer ' + jwt);

      expect(res).toHaveStatus(200);
      expect(res.body.sub).toBe(client.id);
    });
  });

  test('Identity-less token cache is scoped by URL project', async () => {
    const first = await createTestProject({
      withClient: true,
      client: {
        identityProvider: {
          issuer: 'https://external-auth.example.com',
          userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
        },
      },
    });
    const second = await createTestProject({
      withClient: true,
      client: {
        identityProvider: {
          issuer: 'https://external-auth.example.com',
          userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
        },
      },
    });
    await withExternalAuthProviders(undefined, async () => {
      fetchMock
        .mockImplementationOnce(() => mockFetchJson({ ok: true }))
        .mockImplementationOnce(() => mockFetchJson({ ok: true }));

      const jwt = createFakeJwt({
        iss: 'https://external-auth.example.com',
        nonce: randomUUID(),
      });
      const firstResponse = await request(app)
        .get(`/projects/${first.project.id}/oauth2/userinfo`)
        .set('Authorization', 'Bearer ' + jwt);
      const secondResponse = await request(app)
        .get(`/projects/${second.project.id}/oauth2/userinfo`)
        .set('Authorization', 'Bearer ' + jwt);

      expect(firstResponse).toHaveStatus(200);
      expect(firstResponse.body.sub).toBe(first.client.id);
      expect(secondResponse).toHaveStatus(200);
      expect(secondResponse.body.sub).toBe(second.client.id);
    });
  });

  test('Global provider resolves an identity-less token to the project client', async () => {
    const { client, project } = await createTestProject({
      withClient: true,
      client: {
        identityProvider: {
          issuer: 'https://external-auth.example.com',
          userInfoUrl: 'https://external-auth.example.com/oauth2/userinfo',
        },
      },
    });
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({ iss: 'https://external-auth.example.com', nonce: randomUUID() });
    const res = await request(app)
      .get(`/projects/${project.id}/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);

    expect(res).toHaveStatus(200);
    expect(res.body.sub).toBe(client.id);
  });

  test('Rejects ambiguous project clients for an external issuer', async () => {
    const { project } = await createTestProject({
      withClient: true,
      client: {
        identityProvider: {
          issuer: 'https://ambiguous.example.com',
          userInfoUrl: 'https://ambiguous.example.com/oauth2/userinfo',
        },
      },
    });
    const projectRepo = await getProjectSystemRepo(project);
    await projectRepo.createResource({
      resourceType: 'ClientApplication',
      meta: { project: project.id },
      name: 'Duplicate external issuer',
      identityProvider: {
        issuer: 'https://ambiguous.example.com',
        userInfoUrl: 'https://ambiguous.example.com/oauth2/userinfo',
      },
    });

    await withExternalAuthProviders(undefined, async () => {
      const jwt = createFakeJwt({ iss: 'https://ambiguous.example.com', nonce: randomUUID() });
      const res = await request(app)
        .get(`/projects/${project.id}/oauth2/userinfo`)
        .set('Authorization', 'Bearer ' + jwt);
      expect(res).toHaveStatus(401);
    });
  });

  test('Remote call to userinfo fails', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: false }, { status: 401 }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(practitioner),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
  });

  test('Profile not found', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: 'Patient/123',
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
  });

  test('Profile without membership', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    // Create a Practitioner profile that is not a member of the project
    const p2 = await systemRepo.createResource<Practitioner>({ resourceType: 'Practitioner' });
    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(p2),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
  });

  test('Success by reference', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: getReferenceString(practitioner),
      scope: 'openid profile',
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(200);

    // Call it again to ensure caching works
    const res2 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res2).toHaveStatus(200);
  });

  test('Success by search string', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: `Practitioner?identifier=${npi}`,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(200);
  });

  test('Success by absolute URL', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      fhirUser: `https://external.idp/fhir/Practitioner?identifier=${npi}`,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(200);
  });

  test('Success by ext.fhirUser', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      ext: { fhirUser: getReferenceString(practitioner) },
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(200);
  });

  test('Success by sub claim', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
      scope: 'openid profile',
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(200);
  });

  test('Success by JWKS verification', async () => {
    const keyPair = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    const jwksUrl = 'https://external-auth.example.com/.well-known/jwks.json';

    await withExternalAuthProviders(
      [
        {
          issuer: 'https://external-auth.example.com',
          identityProvider: {
            issuer: 'https://external-auth.example.com',
            jwksUrl,
          },
        },
      ],
      async () => {
        fetchMock.mockImplementationOnce(() => mockFetchJson({ keys: [publicJwk] }));

        const jwt = await new SignJWT({
          nonce: randomUUID(),
        })
          .setProtectedHeader({ alg: 'ES256' })
          .setIssuer('https://external-auth.example.com')
          .setSubject(externalSub)
          .setIssuedAt()
          .setExpirationTime('2h')
          .sign(keyPair.privateKey);

        const res = await request(app)
          .get(`/oauth2/userinfo`)
          .set('Authorization', 'Bearer ' + jwt);
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(jwksUrl, expect.anything());
      }
    );
  });

  test('Sub claim with caching', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(200);

    // Call again - should use cache (no second fetch mock needed)
    const res2 = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res2).toHaveStatus(200);
  });

  test('Sub claim with unknown externalId', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: 'nonexistent-' + randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
  });

  test('Sub claim with remote userinfo failure', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: false }, { status: 401 }));

    // Use a unique nonce to avoid cache hits from prior tests
    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: externalSub,
      nonce: randomUUID(),
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
  });

  test('fhirUser takes precedence over sub', async () => {
    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

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
    expect(res).toHaveStatus(200);
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
    await systemRepo.updateResource<ProjectMembership>({
      ...inactiveMembership,
      active: false,
    });

    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: inactiveSub,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
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

    fetchMock.mockImplementationOnce(() => mockFetchJson({ ok: true }));

    const jwt = createFakeJwt({
      iss: 'https://external-auth.example.com',
      sub: duplicateSub,
    });
    const res = await request(app)
      .get(`/oauth2/userinfo`)
      .set('Authorization', 'Bearer ' + jwt);
    expect(res).toHaveStatus(401);
  });
});

function createFakeJwt(claims: Record<string, unknown>): string {
  return `header.${encodeBase64Url(JSON.stringify(claims))}.signature`;
}

async function withExternalAuthProviders(
  externalAuthProviders: MedplumExternalAuthConfig[] | undefined,
  fn: () => Promise<void>
): Promise<void> {
  const savedExternalAuthProviders = getConfig().externalAuthProviders;
  getConfig().externalAuthProviders = externalAuthProviders;

  try {
    await fn();
  } finally {
    getConfig().externalAuthProviders = savedExternalAuthProviders;
  }
}
